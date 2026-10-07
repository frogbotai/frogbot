import type { TextStreamPart, ToolSet } from 'ai';

import { extractReasoningMetadata } from '../../../shared/extractReasoningMetadata.js';
import {
  extractAnthropicStreamErrorInfo,
  type StreamErrorMaskOptions,
} from '../../../shared/extractStreamErrorInfo.js';
import { peekRawValue } from '../../../shared/rawPeek.js';
import {
  extractCacheCreation,
  extractThinkingTokens,
  mapStopReason,
  usageDetailFields,
} from './toAnthropicResponse.js';
import type { AnthropicStopReason } from './types.js';

/**
 * Creates a TransformStream that converts AI SDK TextStreamParts into
 * Anthropic-formatted SSE strings (`event: <type>\ndata: <json>\n\n`).
 */
export function createAnthropicStreamTransform(
  args: {
    model: string;
  } & StreamErrorMaskOptions,
): TransformStream<TextStreamPart<ToolSet>, string> {
  const state = createStreamState(args);

  return new TransformStream({
    transform(part, controller) {
      for (const event of partToEvents(part, state)) {
        controller.enqueue(event);
      }
    },
  });
}

type StreamState = {
  messageStarted: boolean;
  blockIndex: number;
  currentToolCallId: string | undefined;
  openBlockIndex: number | undefined;
  signatureEmittedForBlockIndex: number | undefined;
  responseId: string;
  model: string;
  errored: boolean;
  refusalBlockOpen: boolean;
  stopSequence: string | undefined;
  rawUsage: Record<string, unknown> | undefined;
  maskOpts: StreamErrorMaskOptions;
};

function createStreamState(args: { model: string } & StreamErrorMaskOptions): StreamState {
  return {
    messageStarted: false,
    blockIndex: 0,
    currentToolCallId: undefined,
    openBlockIndex: undefined,
    signatureEmittedForBlockIndex: undefined,
    responseId: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    model: args.model,
    errored: false,
    refusalBlockOpen: false,
    stopSequence: undefined,
    rawUsage: undefined,
    maskOpts: { requestId: args.requestId, production: args.production },
  };
}

function partToEvents(part: TextStreamPart<ToolSet>, state: StreamState): string[] {
  const events: string[] = [];

  if (state.errored) return events;

  if (!state.messageStarted) {
    state.messageStarted = true;

    events.push(
      formatEvent('message_start', {
        type: 'message_start',
        message: {
          id: state.responseId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: state.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }),
    );

    events.push(formatEvent('ping', { type: 'ping' }));
  }

  switch (part.type) {
    case 'reasoning-start': {
      events.push(
        formatEvent('content_block_start', {
          type: 'content_block_start',
          index: state.blockIndex,
          content_block: { type: 'thinking', thinking: '' },
        }),
      );

      state.openBlockIndex = state.blockIndex;
      break;
    }

    case 'reasoning-delta': {
      const signature = extractSignature(part);
      if (signature && state.signatureEmittedForBlockIndex !== state.blockIndex) {
        events.push(
          formatEvent('content_block_delta', {
            type: 'content_block_delta',
            index: state.blockIndex,
            delta: { type: 'signature_delta', signature },
          }),
        );

        state.signatureEmittedForBlockIndex = state.blockIndex;
      }

      if (part.text) {
        events.push(
          formatEvent('content_block_delta', {
            type: 'content_block_delta',
            index: state.blockIndex,
            delta: { type: 'thinking_delta', thinking: part.text },
          }),
        );
      }

      break;
    }

    case 'reasoning-end': {
      const signature = extractSignature(part);
      if (signature && state.signatureEmittedForBlockIndex !== state.blockIndex) {
        events.push(
          formatEvent('content_block_delta', {
            type: 'content_block_delta',
            index: state.blockIndex,
            delta: { type: 'signature_delta', signature },
          }),
        );
      }

      events.push(
        formatEvent('content_block_stop', {
          type: 'content_block_stop',
          index: state.blockIndex,
        }),
      );

      state.openBlockIndex = undefined;
      state.blockIndex++;
      break;
    }

    case 'text-start': {
      events.push(
        formatEvent('content_block_start', {
          type: 'content_block_start',
          index: state.blockIndex,
          content_block: { type: 'text', text: '' },
        }),
      );

      state.openBlockIndex = state.blockIndex;
      break;
    }

    case 'text-delta': {
      events.push(
        formatEvent('content_block_delta', {
          type: 'content_block_delta',
          index: state.blockIndex,
          delta: { type: 'text_delta', text: part.text },
        }),
      );

      break;
    }

    case 'text-end': {
      events.push(
        formatEvent('content_block_stop', {
          type: 'content_block_stop',
          index: state.blockIndex,
        }),
      );

      state.openBlockIndex = undefined;
      state.blockIndex++;
      break;
    }

    case 'tool-input-start': {
      state.currentToolCallId = part.id;

      events.push(
        formatEvent('content_block_start', {
          type: 'content_block_start',
          index: state.blockIndex,
          content_block: {
            type: 'tool_use',
            id: part.id,
            name: part.toolName,
            input: {},
          },
        }),
      );

      state.openBlockIndex = state.blockIndex;
      break;
    }

    case 'tool-input-delta': {
      events.push(
        formatEvent('content_block_delta', {
          type: 'content_block_delta',
          index: state.blockIndex,
          delta: { type: 'input_json_delta', partial_json: part.delta },
        }),
      );

      break;
    }

    case 'tool-call': {
      if (state.currentToolCallId === part.toolCallId) {
        events.push(
          formatEvent('content_block_stop', {
            type: 'content_block_stop',
            index: state.blockIndex,
          }),
        );

        state.openBlockIndex = undefined;
        state.blockIndex++;
        state.currentToolCallId = undefined;
      } else {
        events.push(
          formatEvent('content_block_start', {
            type: 'content_block_start',
            index: state.blockIndex,
            content_block: {
              type: 'tool_use',
              id: part.toolCallId,
              name: part.toolName,
              input: {},
            },
          }),
        );

        state.openBlockIndex = state.blockIndex;
        const inputStr = typeof part.input === 'string' ? part.input : JSON.stringify(part.input);
        if (inputStr && inputStr !== '{}') {
          events.push(
            formatEvent('content_block_delta', {
              type: 'content_block_delta',
              index: state.blockIndex,
              delta: { type: 'input_json_delta', partial_json: inputStr },
            }),
          );
        }

        events.push(
          formatEvent('content_block_stop', {
            type: 'content_block_stop',
            index: state.blockIndex,
          }),
        );

        state.openBlockIndex = undefined;
        state.blockIndex++;
      }

      break;
    }

    case 'finish-step': {
      if (part.response.id) {
        state.responseId = part.response.id;
      }

      if (part.response.modelId) {
        state.model = part.response.modelId;
      }

      const stopSequence = part.providerMetadata?.anthropic?.stopSequence;
      if (typeof stopSequence === 'string') {
        state.stopSequence = stopSequence;
      }

      if (part.usage?.raw) {
        state.rawUsage = part.usage.raw;
      }

      break;
    }

    case 'finish': {
      if (state.refusalBlockOpen) {
        events.push(
          formatEvent('content_block_stop', {
            type: 'content_block_stop',
            index: state.blockIndex,
          }),
        );

        state.openBlockIndex = undefined;
        state.blockIndex++;
        state.refusalBlockOpen = false;
      }

      const stopReason: AnthropicStopReason = mapStopReason(
        part.finishReason,
        part.rawFinishReason,
      );

      const rawUsage = state.rawUsage ?? part.totalUsage?.raw;
      const serviceTier =
        typeof rawUsage?.service_tier === 'string' ? rawUsage.service_tier : undefined;

      const thinkingTokens =
        extractThinkingTokens(rawUsage) ?? part.totalUsage?.outputTokenDetails?.reasoningTokens;

      const cacheCreation = extractCacheCreation(rawUsage);

      events.push(
        formatEvent('message_delta', {
          type: 'message_delta',
          delta: {
            stop_reason: stopReason,
            stop_sequence: state.stopSequence ?? null,
          },
          usage: {
            input_tokens: part.totalUsage?.inputTokens ?? 0,
            output_tokens: part.totalUsage?.outputTokens ?? 0,
            ...(part.totalUsage?.inputTokenDetails?.cacheWriteTokens !== undefined
              ? {
                  cache_creation_input_tokens: part.totalUsage.inputTokenDetails.cacheWriteTokens,
                }
              : {}),
            ...(part.totalUsage?.inputTokenDetails?.cacheReadTokens !== undefined
              ? {
                  cache_read_input_tokens: part.totalUsage.inputTokenDetails.cacheReadTokens,
                }
              : {}),
            ...(serviceTier !== undefined ? { service_tier: serviceTier } : {}),
            ...usageDetailFields({ thinkingTokens, cacheCreation }),
          },
        }),
      );

      events.push(formatEvent('message_stop', { type: 'message_stop' }));
      break;
    }

    case 'raw': {
      const extras = peekRawValue(part.rawValue);
      if (extras?.refusal) {
        if (!state.refusalBlockOpen) {
          events.push(
            formatEvent('content_block_start', {
              type: 'content_block_start',
              index: state.blockIndex,
              content_block: { type: 'text', text: '' },
            }),
          );

          state.openBlockIndex = state.blockIndex;

          events.push(
            formatEvent('content_block_delta', {
              type: 'content_block_delta',
              index: state.blockIndex,
              delta: { type: 'text_delta', text: '[refusal] ' },
            }),
          );

          state.refusalBlockOpen = true;
        }

        events.push(
          formatEvent('content_block_delta', {
            type: 'content_block_delta',
            index: state.blockIndex,
            delta: { type: 'text_delta', text: extras.refusal },
          }),
        );
      }

      break;
    }

    case 'error': {
      const errorInfo = extractAnthropicStreamErrorInfo(part.error, state.maskOpts);
      if (state.openBlockIndex !== undefined) {
        events.push(
          formatEvent('content_block_stop', {
            type: 'content_block_stop',
            index: state.openBlockIndex,
          }),
        );

        state.openBlockIndex = undefined;
        state.blockIndex++;
      }

      events.push(
        formatEvent('error', {
          type: 'error',
          error: { type: errorInfo.type, message: errorInfo.message },
        }),
      );

      if (state.messageStarted) {
        events.push(formatEvent('message_stop', { type: 'message_stop' }));
      }

      state.errored = true;
      break;
    }

    default:
      break;
  }

  return events;
}

function formatEvent(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractSignature(part: {
  providerMetadata?: Record<string, Record<string, unknown>>;
}): string | undefined {
  return extractReasoningMetadata(part.providerMetadata).signature;
}
