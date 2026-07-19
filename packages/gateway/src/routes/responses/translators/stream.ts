import type { TextStreamPart, ToolSet } from 'ai';

import { extractOpenAIStreamErrorInfo, type StreamErrorMaskOptions } from '../../../shared/extractStreamErrorInfo.js';
import { peekRawValue } from '../../../shared/rawPeek.js';
import { echoFields, toResponseUsage, type ResponsesEchoParams } from './toResponse.js';

type ResponsesToolCallState = {
  callId: string;
  toolName: string;
  outputIndex: number;
  itemId: string;
  arguments: string;
};

type ResponsesReasoningState = {
  outputIndex: number;
  itemId: string;
  summaryText: string;
  encryptedContent?: string;
};

type ResponsesFinishReason = 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error' | 'other';

type ResponsesStreamState = {
  responseId: string;
  messageId: string;
  createdAt: number;
  model: string;
  started: boolean;
  outputStarted: boolean;
  textOutputIndex: number;
  text: string;
  serviceTier?: string;
  nextOutputIndex: number;
  sequenceNumber: number;
  reasoning: ResponsesReasoningState | null;
  toolCalls: Map<string, ResponsesToolCallState>;
  finishReason?: ResponsesFinishReason;
  errorInfo?: { code?: string | null; message: string };
  usage: Record<string, unknown> | null;
  body: ResponsesEchoParams;
  /** Masking context for mid-stream error frames (G35). */
  maskOpts: StreamErrorMaskOptions;
};

type StreamStatus = 'in_progress' | 'completed' | 'incomplete' | 'failed';

export function createResponsesStreamTransform(
  args: {
    model: string;
    previousResponseId?: string | null;
    body?: ResponsesEchoParams;
  } & StreamErrorMaskOptions,
): TransformStream<TextStreamPart<ToolSet>, string> {
  const state: ResponsesStreamState = {
    responseId: `resp_${crypto.randomUUID()}`,
    messageId: `msg_${crypto.randomUUID()}`,
    createdAt: Math.floor(Date.now() / 1000),
    model: args.model,
    started: false,
    outputStarted: false,
    textOutputIndex: 0,
    text: '',
    serviceTier: undefined,
    nextOutputIndex: 0,
    sequenceNumber: 0,
    reasoning: null,
    toolCalls: new Map(),
    usage: null,
    body: args.body ?? {},
    maskOpts: { requestId: args.requestId, production: args.production },
  };

  return new TransformStream({
    transform(part, controller) {
      const events = partToEvents(part, state);
      // Defer the `response.created`/`response.in_progress` preamble until the
      // first meaningful frame is produced. If that first frame is an error,
      // emit only the error so the SSE peek in the handler can catch it and
      // return a proper JSON error status instead of committing to HTTP 200.
      // Bookkeeping-only parts (`start`, `raw`, `finish-step`) produce no
      // events and must not trigger the preamble on their own.
      if (!state.started && events.length > 0 && part.type !== 'error') {
        emitPreamble(controller, state, args.previousResponseId);
      }
      for (const event of events) {
        enqueue(controller, state, event.type, event);
      }
    },
    flush(controller) {
      // Nothing streamed and no error surfaced — still emit the preamble so a
      // well-behaved empty response has a `response.created` before completion.
      if (!state.started) {
        emitPreamble(controller, state, args.previousResponseId);
      }

      if (state.outputStarted) {
        enqueue(controller, state, 'response.output_text.done', {
          type: 'response.output_text.done',
          item_id: state.messageId,
          output_index: state.textOutputIndex,
          content_index: 0,
          text: state.text,
        });
        enqueue(controller, state, 'response.content_part.done', {
          type: 'response.content_part.done',
          item_id: state.messageId,
          output_index: state.textOutputIndex,
          content_index: 0,
          part: { type: 'output_text', text: state.text, annotations: [] },
        });
        enqueue(controller, state, 'response.output_item.done', {
          type: 'response.output_item.done',
          output_index: state.textOutputIndex,
          item: messageItem(state, 'completed'),
        });
      }

      const { event, status } = terminalEvent(state.finishReason);
      enqueue(controller, state, event, {
        type: event,
        response: responseEnvelope(state, args.previousResponseId, status),
      });
    },
  });
}

function emitPreamble(
  controller: TransformStreamDefaultController<string>,
  state: ResponsesStreamState,
  previousResponseId: string | null | undefined,
) {
  state.started = true;
  enqueue(controller, state, 'response.created', {
    type: 'response.created',
    response: responseEnvelope(state, previousResponseId, 'in_progress'),
  });
  enqueue(controller, state, 'response.in_progress', {
    type: 'response.in_progress',
    response: responseEnvelope(state, previousResponseId, 'in_progress'),
  });
}

function terminalEvent(finishReason: ResponsesFinishReason | undefined): {
  event: string;
  status: StreamStatus;
} {
  switch (finishReason) {
    case 'length':
    case 'content-filter':
      return { event: 'response.incomplete', status: 'incomplete' };
    case 'error':
    case 'other':
      return { event: 'response.failed', status: 'failed' };
    default:
      return { event: 'response.completed', status: 'completed' };
  }
}

function partToEvents(
  part: TextStreamPart<ToolSet>,
  state: ResponsesStreamState,
): Array<Record<string, unknown> & { type: string }> {
  switch (part.type) {
    case 'text-delta': {
      const events = ensureOutputStarted(state);
      state.text += part.text;
      events.push({
        type: 'response.output_text.delta',
        item_id: state.messageId,
        output_index: state.textOutputIndex,
        content_index: 0,
        delta: part.text,
      });
      return events;
    }
    case 'reasoning-start': {
      const outputIndex = state.nextOutputIndex++;
      state.reasoning = {
        outputIndex,
        itemId: `rs_${crypto.randomUUID()}`,
        summaryText: '',
      };
      captureEncryptedContent(state.reasoning, part.providerMetadata);
      return [
        {
          type: 'response.output_item.added',
          output_index: outputIndex,
          item: reasoningItem(state.reasoning, 'in_progress'),
        },
        {
          type: 'response.reasoning_summary_part.added',
          item_id: state.reasoning.itemId,
          output_index: outputIndex,
          summary_index: 0,
          part: { type: 'summary_text', text: '' },
        },
      ];
    }
    case 'reasoning-delta': {
      const reasoning = ensureReasoning(state);
      reasoning.summaryText += part.text;
      return [
        {
          type: 'response.reasoning_summary_text.delta',
          item_id: reasoning.itemId,
          output_index: reasoning.outputIndex,
          summary_index: 0,
          delta: part.text,
        },
      ];
    }
    case 'reasoning-end': {
      const reasoning = state.reasoning;
      if (!reasoning) return [];
      captureEncryptedContent(reasoning, part.providerMetadata);
      return [
        {
          type: 'response.reasoning_summary_text.done',
          item_id: reasoning.itemId,
          output_index: reasoning.outputIndex,
          summary_index: 0,
          text: reasoning.summaryText,
        },
        {
          type: 'response.reasoning_summary_part.done',
          item_id: reasoning.itemId,
          output_index: reasoning.outputIndex,
          summary_index: 0,
          part: { type: 'summary_text', text: reasoning.summaryText },
        },
        {
          type: 'response.output_item.done',
          output_index: reasoning.outputIndex,
          item: reasoningItem(reasoning, 'completed'),
        },
      ];
    }
    case 'finish-step': {
      // G7: responseId/model/createdAt are frozen at construction (synthetic
      // resp id + user-requested model). `response.created` and
      // `response.completed` must share the same response id, so the upstream
      // provider's response id/modelId from `finish-step` is NOT adopted.
      state.finishReason = mapFinishReason(part.finishReason);
      state.usage = toResponseUsage(part.usage);
      return [];
    }
    case 'raw': {
      const extras = peekRawValue(part.rawValue);
      if (extras?.serviceTier) {
        state.serviceTier = extras.serviceTier;
      }
      return [];
    }
    case 'tool-input-start': {
      const outputIndex = state.nextOutputIndex++;
      const call: ResponsesToolCallState = {
        callId: part.id,
        toolName: part.toolName,
        outputIndex,
        itemId: `fc_${crypto.randomUUID()}`,
        arguments: '',
      };
      state.toolCalls.set(part.id, call);
      return [
        {
          type: 'response.output_item.added',
          output_index: outputIndex,
          item: functionCallItem(call, 'in_progress'),
        },
      ];
    }
    case 'tool-input-delta': {
      const call = state.toolCalls.get(part.id);
      if (!call) return [];
      call.arguments += part.delta;
      return [
        {
          type: 'response.function_call_arguments.delta',
          item_id: call.itemId,
          output_index: call.outputIndex,
          delta: part.delta,
        },
      ];
    }
    case 'tool-input-end': {
      const call = state.toolCalls.get(part.id);
      if (!call) return [];
      return [
        {
          type: 'response.function_call_arguments.done',
          item_id: call.itemId,
          output_index: call.outputIndex,
          arguments: call.arguments,
        },
        {
          type: 'response.output_item.done',
          output_index: call.outputIndex,
          item: functionCallItem(call, 'completed'),
        },
      ];
    }
    case 'tool-call': {
      let call = state.toolCalls.get(part.toolCallId);
      // Non-streaming providers may emit `tool-call` without prior
      // `tool-input-*` parts — synthesize the full item lifecycle.
      if (!call) {
        const outputIndex = state.nextOutputIndex++;
        call = {
          callId: part.toolCallId,
          toolName: part.toolName,
          outputIndex,
          itemId: `fc_${crypto.randomUUID()}`,
          arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {}),
        };
        state.toolCalls.set(part.toolCallId, call);
        return [
          {
            type: 'response.output_item.added',
            output_index: outputIndex,
            item: functionCallItem(call, 'in_progress'),
          },
          {
            type: 'response.function_call_arguments.done',
            item_id: call.itemId,
            output_index: outputIndex,
            arguments: call.arguments,
          },
          {
            type: 'response.output_item.done',
            output_index: outputIndex,
            item: functionCallItem(call, 'completed'),
          },
        ];
      }
      if (!call.arguments && part.input != null) {
        call.arguments = typeof part.input === 'string' ? part.input : JSON.stringify(part.input);
      }
      return [];
    }
    case 'error': {
      const error = extractOpenAIStreamErrorInfo(part.error, state.maskOpts);
      state.finishReason = 'error';
      state.errorInfo = { code: error.code, message: error.message };
      return [
        {
          type: 'error',
          error: { message: error.message, type: error.type, code: error.code },
        },
      ];
    }
    default:
      return [];
  }
}

function mapFinishReason(finishReason: string | null | undefined): ResponsesFinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'tool-calls':
      return 'tool-calls';
    case 'length':
      return 'length';
    case 'content-filter':
      return 'content-filter';
    case 'error':
      return 'error';
    default:
      return 'other';
  }
}

function ensureReasoning(state: ResponsesStreamState): ResponsesReasoningState {
  if (state.reasoning) return state.reasoning;
  const outputIndex = state.nextOutputIndex++;
  state.reasoning = {
    outputIndex,
    itemId: `rs_${crypto.randomUUID()}`,
    summaryText: '',
  };
  return state.reasoning;
}

function ensureOutputStarted(state: ResponsesStreamState): Array<Record<string, unknown> & { type: string }> {
  if (state.outputStarted) return [];
  state.outputStarted = true;
  state.textOutputIndex = state.nextOutputIndex++;
  return [
    {
      type: 'response.output_item.added',
      output_index: state.textOutputIndex,
      item: messageItem(state, 'in_progress'),
    },
    {
      type: 'response.content_part.added',
      item_id: state.messageId,
      output_index: state.textOutputIndex,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    },
  ];
}

function functionCallItem(call: ResponsesToolCallState, status: 'in_progress' | 'completed') {
  return {
    id: call.itemId,
    type: 'function_call',
    status,
    call_id: call.callId,
    name: call.toolName,
    arguments: call.arguments,
  };
}

function reasoningItem(reasoning: ResponsesReasoningState, status: 'in_progress' | 'completed') {
  return {
    id: reasoning.itemId,
    type: 'reasoning',
    status,
    summary:
      status === 'completed' && reasoning.summaryText ? [{ type: 'summary_text', text: reasoning.summaryText }] : [],
    ...(status === 'completed' && reasoning.encryptedContent != null
      ? { encrypted_content: reasoning.encryptedContent }
      : {}),
  };
}

// OpenAI surfaces ZDR reasoning replay tokens (requested via
// include: ["reasoning.encrypted_content"]) through the AI SDK as
// providerMetadata.openai.reasoningEncryptedContent — see
// ai/packages/openai/src/responses/openai-responses-provider-metadata.ts:20-23.
function captureEncryptedContent(
  reasoning: ResponsesReasoningState,
  providerMetadata: Record<string, Record<string, unknown>> | undefined,
) {
  const value = providerMetadata?.openai?.reasoningEncryptedContent;
  if (typeof value === 'string') {
    reasoning.encryptedContent = value;
  }
}

function responseEnvelope(
  state: ResponsesStreamState,
  previousResponseId: string | null | undefined,
  status: StreamStatus,
) {
  const terminal = status !== 'in_progress';
  return {
    id: state.responseId,
    object: 'response',
    created_at: state.createdAt,
    completed_at: status === 'completed' ? state.createdAt : null,
    status,
    error: status === 'failed' ? failedError(state) : null,
    incomplete_details: status === 'incomplete' ? { reason: incompleteReason(state.finishReason) } : null,
    model: state.model,
    previous_response_id: previousResponseId ?? null,
    ...echoFields(state.body),
    ...(state.serviceTier ? { service_tier: state.serviceTier } : {}),
    output: terminal ? completedOutput(state) : [],
    output_text: terminal ? state.text : undefined,
    usage: status === 'failed' ? null : terminal ? state.usage : null,
  };
}

function incompleteReason(finishReason: ResponsesFinishReason | undefined): string {
  return finishReason === 'content-filter' ? 'content_filter' : 'max_output_tokens';
}

function failedError(state: ResponsesStreamState) {
  return {
    code: state.errorInfo?.code ?? 'server_error',
    message: state.errorInfo?.message ?? 'The model failed to generate a response.',
  };
}

function completedOutput(state: ResponsesStreamState) {
  const items: Array<{ outputIndex: number; item: Record<string, unknown> }> = [];
  if (state.reasoning) {
    items.push({
      outputIndex: state.reasoning.outputIndex,
      item: reasoningItem(state.reasoning, 'completed'),
    });
  }
  if (state.outputStarted) {
    items.push({
      outputIndex: state.textOutputIndex,
      item: messageItem(state, 'completed'),
    });
  }
  for (const call of state.toolCalls.values()) {
    items.push({
      outputIndex: call.outputIndex,
      item: functionCallItem(call, 'completed'),
    });
  }
  return items.sort((a, b) => a.outputIndex - b.outputIndex).map((entry) => entry.item);
}

function messageItem(state: ResponsesStreamState, status: 'in_progress' | 'completed') {
  return {
    id: state.messageId,
    type: 'message',
    role: 'assistant',
    status,
    content: [
      {
        type: 'output_text',
        text: status === 'completed' ? state.text : '',
        annotations: [],
      },
    ],
  };
}

function enqueue(
  controller: TransformStreamDefaultController<string>,
  state: ResponsesStreamState,
  event: string,
  data: Record<string, unknown>,
) {
  const payload = { ...data, sequence_number: state.sequenceNumber++ };
  controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}
