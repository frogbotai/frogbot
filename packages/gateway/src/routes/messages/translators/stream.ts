// Anthropic SSE stream translator.
//
// Converts AI SDK `fullStream` (TextStreamPart) chunks into Anthropic-compatible
// Server-Sent Events for `/v1/messages` with `stream: true`.
//
// Anthropic streaming shape:
//   event: <event_type>\ndata: <JSON>\n\n
//
// Event sequence:
//   message_start → ping
//                 → (content_block_start → content_block_delta* → content_block_stop)*
//                 → message_delta → message_stop
//
// Design decisions:
//   - Block indices are allocated in strict emission order via a single
//     monotonic counter. Every start bumps it, every stop closes the current.
//   - We drive text blocks off `text-start`/`text-end` (AI SDK provides them)
//     rather than inferring boundaries from delta arrival — no stateful
//     "current block" flush needed for text.
//   - `signature_delta` for extended thinking is emitted inline when it first
//     appears on a `reasoning-delta`, matching Anthropic's actual wire order.
//   - Non-streaming `tool-call` (no preceding `tool-input-start`) is expanded
//     inline into start+delta+stop so the client sees a complete block.

import type { TextStreamPart, ToolSet } from 'ai';

import {
  extractAnthropicStreamErrorInfo,
  type StreamErrorMaskOptions,
} from '../../../shared/extractStreamErrorInfo.js';
import { peekRawValue } from '../../../shared/rawPeek.js';
import {
  mapStopReason,
  extractThinkingTokens,
  extractCacheCreation,
  usageDetailFields,
} from './toAnthropicResponse.js';
import type { AnthropicStopReason } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Stream state
// ---------------------------------------------------------------------------

type StreamState = {
  messageStarted: boolean;
  blockIndex: number;
  currentToolCallId: string | undefined;
  openBlockIndex: number | undefined;
  signatureEmittedForBlockIndex: number | undefined;
  responseId: string;
  model: string;
  errored: boolean;
  /** Tracks whether a refusal text block has been opened via raw peek. */
  refusalBlockOpen: boolean;
  /** Matched stop sequence from providerMetadata.anthropic (same-provider only). */
  stopSequence: string | undefined;
  /**
   * Raw provider usage from the last finish-step. The finish part's
   * `totalUsage` is built by addLanguageModelUsage (ai/src/types/usage.ts),
   * which drops `raw` — only the per-step usage carries it.
   */
  rawUsage: Record<string, unknown> | undefined;
  /** Masking context for mid-stream error frames (G35). */
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

// ---------------------------------------------------------------------------
// Part → Anthropic SSE event(s)
// ---------------------------------------------------------------------------

function partToEvents(part: TextStreamPart<ToolSet>, state: StreamState): string[] {
  const events: string[] = [];

  if (state.errored) return events;

  // Emit message_start + ping lazily on the first part.
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
      // Emit signature_delta the first time we see one for this block —
      // Anthropic's wire has it interleaved with thinking_delta.
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
      // Fallback for providers that only surface the signature at end.
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
        // Streaming tool input already started — just close the block.
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
        // Non-streaming tool call: emit start + full input + stop atomically.
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
      // If a refusal block was opened, close it before finishing
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

      // content-filter → refusal (inverse of the AI SDK's refusal → content-filter map).
      const stopReason: AnthropicStopReason = mapStopReason(part.finishReason, part.rawFinishReason);

      const rawUsage = state.rawUsage ?? part.totalUsage?.raw;
      const serviceTier = typeof rawUsage?.service_tier === 'string' ? rawUsage.service_tier : undefined;
      const thinkingTokens = extractThinkingTokens(rawUsage) ?? part.totalUsage?.outputTokenDetails?.reasoningTokens;
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
      // Peek for refusal from raw OpenAI chunks — Anthropic has no canonical
      // refusal wire, so we emit a synthesized text block prefixed `[refusal] `.
      const extras = peekRawValue(part.rawValue);
      if (extras?.refusal) {
        if (!state.refusalBlockOpen) {
          // Open a new text block for the refusal
          events.push(
            formatEvent('content_block_start', {
              type: 'content_block_start',
              index: state.blockIndex,
              content_block: { type: 'text', text: '' },
            }),
          );
          state.openBlockIndex = state.blockIndex;
          // Emit the prefix
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEvent(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractSignature(part: { providerMetadata?: Record<string, Record<string, unknown>> }): string | undefined {
  const meta = part.providerMetadata;
  if (!meta) return undefined;
  const anthropic = meta.anthropic ?? meta.unknown;
  const sig = anthropic?.signature;
  return typeof sig === 'string' ? sig : undefined;
}
