// OpenAI SSE stream translator.
//
// Converts AI SDK `fullStream` (TextStreamPart) chunks into OpenAI-compatible
// Server-Sent Events for `/v1/chat/completions` with `stream: true`.
//
// Each SSE frame is `data: <JSON>\n\n`; the terminal `data: [DONE]\n\n` is
// appended by the SSE wrapper (`toSseStream`), not this translator.
//
// Design decisions (locked from research doc Finding 1):
//   - Role injection: first text/tool delta includes `role: "assistant"`.
//   - Block-index allocator: maps AI SDK block `id`s to integer indices.
//   - Tool-call streaming: incremental `function.arguments` JSON fragments.
//   - `includeRawChunks: true` is always passed to AI SDK for refusal/fingerprint peek.
//   - Heartbeat: not implemented in v0 (clients handle silence fine for <30s).

import type { TextStreamPart, ToolSet } from 'ai';

import { extractOpenAIStreamErrorInfo, type StreamErrorMaskOptions } from '../../../shared/extractStreamErrorInfo.js';
import { peekRawValue } from '../../../shared/rawPeek.js';
import { toReasoningDetail } from '../../../shared/toReasoningDetail.js';
import type { OpenAIReasoningDetail } from './types.js';

// ---------------------------------------------------------------------------
// OpenAI streaming chunk types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Stream state
// ---------------------------------------------------------------------------

type StreamState = {
  roleEmitted: boolean;
  /** Maps AI SDK block IDs to integer tool-call indices. */
  toolCallIndices: Map<string, number>;
  nextToolCallIndex: number;
  /** Maps AI SDK reasoning block IDs to stable integer indices. */
  reasoningIdToIndex: Map<string, number>;
  nextReasoningIndex: number;
  responseId: string;
  model: string;
  created: number;
  systemFingerprint: string | null;
  serviceTier: string | null;
  /** When true, honor OpenAI `stream_options.include_usage` wire semantics. */
  includeUsage: boolean;
  /** Accumulated refusal text from raw chunks. */
  refusal: string | null;
  /** Masking context for mid-stream error frames (G35). */
  maskOpts: StreamErrorMaskOptions;
};

function createStreamState(args: { model: string; includeUsage?: boolean } & StreamErrorMaskOptions): StreamState {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Part → OpenAI chunk(s) mapping
// ---------------------------------------------------------------------------

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
      // G7: id/model/created are frozen at construction (synthetic chatcmpl id
      // + user-requested model). Every chunk in a stream must share the same
      // id/model per OpenAI's wire contract, so the upstream provider's
      // response id/modelId from `finish-step` is NOT adopted.

      // G54: refusal text is orthogonal to finish_reason — OpenAI returns
      // 'stop' for model refusals; 'content_filter' is reserved for the
      // infrastructure safety layer. Pass through the upstream reason.
      const finishReason = mapFinishReason(part.finishReason);
      const chunk = makeChunk(state, {
        delta: {},
        finish_reason: finishReason,
      });
      // Build the usage totals for the request.
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
        // include_usage: the finish chunk carries usage: null (set by
        // makeChunk); the populated totals arrive on a dedicated empty-choices
        // chunk emitted after it and before the terminal [DONE].
        return [chunk, makeUsageChunk(state, usage)];
      }
      // Default (backward-compatible) path: usage populated on the finish chunk.
      chunk.usage = usage;
      return [chunk];
    }

    case 'raw': {
      // Peek for system_fingerprint, service_tier, and refusal from raw OpenAI chunks
      const extras = peekRawValue(part.rawValue);
      if (extras) {
        if (extras.systemFingerprint) {
          state.systemFingerprint = extras.systemFingerprint;
        }
        if (extras.serviceTier) {
          state.serviceTier = extras.serviceTier;
        }
        if (extras.refusal) {
          // Emit refusal delta inline — OpenAI surfaces refusal as a delta field
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
      // Mid-stream error: emit a chunk with an error field and null finish_reason.
      // This matches OpenAI's observed mid-stream behavior — the chunk carries
      // error info but the HTTP status remains 200 (already sent).
      const errorInfo = extractOpenAIStreamErrorInfo(part.error, state.maskOpts);
      const chunk = makeChunk(state, { delta: {}, finish_reason: null });
      chunk.error = {
        message: errorInfo.message,
        type: errorInfo.type,
        code: errorInfo.code,
      };
      return [chunk];
    }

    // Parts we don't emit for (stream bookkeeping, sources, files, etc.)
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // include_usage contract: every non-final chunk carries an explicit
  // `usage: null`; the populated totals arrive on a dedicated final chunk.
  if (state.includeUsage) {
    chunk.usage = null;
  }
  return chunk;
}

// Dedicated empty-choices usage chunk emitted before the terminal [DONE] when
// the client requested `stream_options.include_usage`. Shares the stream's
// id/created/model (plus system_fingerprint/service_tier when present) with
// every other chunk — a full-shaped `chat.completion.chunk`, not a bare object.
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

// G57: 'error'/'other'/'unknown' are AI SDK finish reasons with no OpenAI
// enum value — pass 'error' through and fold 'unknown' into 'other' so a
// failed step is never masked as a clean 'stop'.
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
