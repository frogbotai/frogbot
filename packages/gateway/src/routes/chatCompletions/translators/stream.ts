import type { TextStreamPart, ToolSet } from 'ai';

import {
  extractOpenAIStreamErrorInfo,
  type StreamErrorMaskOptions,
} from '../../../shared/extractStreamErrorInfo.js';
import { peekRawValue } from '../../../shared/rawPeek.js';
import { toReasoningDetail } from '../../../shared/toReasoningDetail.js';
import type { OpenAIReasoningDetail } from './types.js';

export type OpenAIStreamChunk = {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint?: string | null;
  service_tier?: string | null;
  choices: OpenAIStreamChoice[];
  usage?: OpenAIStreamUsage | null;
  error?: {
    message: string;
    type: string;
    code: string | null;
  };
};

type OpenAIStreamChoice = {
  index: number;
  delta: OpenAIStreamDelta;
  finish_reason: string | null;
};

type OpenAIStreamDelta = {
  role?: 'assistant';
  content?: string | null;
  reasoning_content?: string | null;
  reasoning_details?: OpenAIReasoningDetail[];
  refusal?: string | null;
  tool_calls?: OpenAIStreamToolCallDelta[];
};

type OpenAIStreamToolCallDelta = {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAIStreamUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

type StreamState = {
  roleEmitted: boolean;
  toolCallIndices: Map<string, number>;
  nextToolCallIndex: number;
  reasoningIdToIndex: Map<string, number>;
  nextReasoningIndex: number;
  responseId: string;
  model: string;
  created: number;
  systemFingerprint: string | null;
  serviceTier: string | null;
  includeUsage: boolean;
  refusal: string | null;
  maskOpts: StreamErrorMaskOptions;
};

function createStreamState(
  args: { model: string; includeUsage?: boolean } & StreamErrorMaskOptions,
): StreamState {
  return {
    roleEmitted: false,
    toolCallIndices: new Map(),
    nextToolCallIndex: 0,
    reasoningIdToIndex: new Map(),
    nextReasoningIndex: 0,
    responseId: `chatcmpl-${crypto.randomUUID()}`,
    model: args.model,
    created: Math.floor(Date.now() / 1000),
    systemFingerprint: null,
    serviceTier: null,
    includeUsage: args.includeUsage ?? false,
    refusal: null,
    maskOpts: { requestId: args.requestId, production: args.production },
  };
}

/**
 * Creates a TransformStream that converts AI SDK TextStreamParts into
 * SSE-encoded strings (`data: {...}\n\n`). The terminal `data: [DONE]\n\n`
 * sentinel is owned by the SSE wrapper (`toSseStream` `appendDone`), not here.
 */
export function createOpenAIStreamTransform(
  args: {
    model: string;
    includeUsage?: boolean;
  } & StreamErrorMaskOptions,
): TransformStream<TextStreamPart<ToolSet>, string> {
  const state = createStreamState(args);

  return new TransformStream({
    transform(part, controller) {
      const chunks = partToChunks(part, state);

      for (const chunk of chunks) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    },
  });
}

function partToChunks(part: TextStreamPart<ToolSet>, state: StreamState): OpenAIStreamChunk[] {
  switch (part.type) {
    case 'text-delta': {
      const delta: OpenAIStreamDelta = { content: part.text };
      if (!state.roleEmitted) {
        delta.role = 'assistant';
        state.roleEmitted = true;
      }

      return [makeChunk(state, { delta, finish_reason: null })];
    }

    case 'reasoning-delta': {
      let index = state.reasoningIdToIndex.get(part.id);
      if (index === undefined) {
        index = state.nextReasoningIndex++;
        state.reasoningIdToIndex.set(part.id, index);
      }

      const detail = toReasoningDetail({
        text: part.text,
        providerMetadata: part.providerMetadata,
        id: part.id,
        index,
      });

      const delta: OpenAIStreamDelta = {
        reasoning_content: part.text,
        reasoning_details: [detail],
      };

      if (!state.roleEmitted) {
        delta.role = 'assistant';
        state.roleEmitted = true;
      }

      return [makeChunk(state, { delta, finish_reason: null })];
    }

    case 'tool-input-start': {
      let index = state.toolCallIndices.get(part.id);
      if (index === undefined) {
        index = state.nextToolCallIndex++;
        state.toolCallIndices.set(part.id, index);
      }

      const delta: OpenAIStreamDelta = {
        tool_calls: [
          {
            index,
            id: part.id,
            type: 'function',
            function: { name: part.toolName, arguments: '' },
          },
        ],
      };

      if (!state.roleEmitted) {
        delta.role = 'assistant';
        state.roleEmitted = true;
      }

      return [makeChunk(state, { delta, finish_reason: null })];
    }

    case 'tool-input-delta': {
      const index = state.toolCallIndices.get(part.id) ?? 0;
      const delta: OpenAIStreamDelta = {
        tool_calls: [
          {
            index,
            function: { arguments: part.delta },
          },
        ],
      };

      return [makeChunk(state, { delta, finish_reason: null })];
    }

    case 'finish-step': {
      const finishReason = mapFinishReason(part.finishReason);
      const chunk = makeChunk(state, {
        delta: {},
        finish_reason: finishReason,
      });

      const usage: OpenAIStreamUsage = {
        prompt_tokens: part.usage.inputTokens ?? 0,
        completion_tokens: part.usage.outputTokens ?? 0,
        total_tokens: part.usage.totalTokens ?? 0,
      };

      if (
        part.usage.inputTokenDetails?.cacheReadTokens !== undefined ||
        part.usage.inputTokenDetails?.cacheWriteTokens !== undefined
      ) {
        usage.prompt_tokens_details = {
          ...(part.usage.inputTokenDetails.cacheReadTokens !== undefined
            ? { cached_tokens: part.usage.inputTokenDetails.cacheReadTokens }
            : {}),
          ...(part.usage.inputTokenDetails.cacheWriteTokens !== undefined
            ? {
                cache_write_tokens: part.usage.inputTokenDetails.cacheWriteTokens,
              }
            : {}),
        };
      }

      if (part.usage.outputTokenDetails?.reasoningTokens !== undefined) {
        usage.completion_tokens_details = {
          reasoning_tokens: part.usage.outputTokenDetails.reasoningTokens,
        };
      }

      if (state.includeUsage) {
        return [chunk, makeUsageChunk(state, usage)];
      }

      chunk.usage = usage;

      return [chunk];
    }

    case 'raw': {
      const extras = peekRawValue(part.rawValue);
      if (extras) {
        if (extras.systemFingerprint) {
          state.systemFingerprint = extras.systemFingerprint;
        }

        if (extras.serviceTier) {
          state.serviceTier = extras.serviceTier;
        }

        if (extras.refusal) {
          state.refusal = (state.refusal ?? '') + extras.refusal;
          const delta: OpenAIStreamDelta = { refusal: extras.refusal };
          if (!state.roleEmitted) {
            delta.role = 'assistant';
            state.roleEmitted = true;
          }

          return [makeChunk(state, { delta, finish_reason: null })];
        }
      }

      return [];
    }

    case 'error': {
      const errorInfo = extractOpenAIStreamErrorInfo(part.error, state.maskOpts);
      const chunk = makeChunk(state, { delta: {}, finish_reason: null });

      chunk.error = {
        message: errorInfo.message,
        type: errorInfo.type,
        code: errorInfo.code,
      };

      return [chunk];
    }

    default:
      return [];
  }
}

function makeChunk(
  state: StreamState,
  choice: { delta: OpenAIStreamDelta; finish_reason: string | null },
): OpenAIStreamChunk {
  const chunk: OpenAIStreamChunk = {
    id: state.responseId,
    object: 'chat.completion.chunk',
    created: state.created,
    model: state.model,
    ...(state.systemFingerprint ? { system_fingerprint: state.systemFingerprint } : {}),
    ...(state.serviceTier ? { service_tier: state.serviceTier } : {}),
    choices: [{ index: 0, ...choice }],
  };

  if (state.includeUsage) {
    chunk.usage = null;
  }

  return chunk;
}

function makeUsageChunk(state: StreamState, usage: OpenAIStreamUsage): OpenAIStreamChunk {
  return {
    id: state.responseId,
    object: 'chat.completion.chunk',
    created: state.created,
    model: state.model,
    ...(state.systemFingerprint ? { system_fingerprint: state.systemFingerprint } : {}),
    ...(state.serviceTier ? { service_tier: state.serviceTier } : {}),
    choices: [],
    usage,
  };
}

function mapFinishReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool-calls':
      return 'tool_calls';
    case 'content-filter':
      return 'content_filter';
    case 'error':
      return 'error';
    case 'other':
    case 'unknown':
      return 'other';
    default:
      return 'stop';
  }
}
