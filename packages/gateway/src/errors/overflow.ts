// Context-overflow detection.
//
// Provider error responses for "input exceeds context window" vary widely:
// status code can be 400, 413, or buried in a 200-stream `error` event;
// the message text differs per provider; and some providers (Cerebras,
// Mistral) return empty bodies on 400/413.
//
// We normalize all of these to a single OpenAI-canonical envelope:
//
//   { type: "invalid_request_error",
//     code: "context_length_exceeded",
//     status: 400,
//     param: "messages" }
//
// Pattern source: opencode's `provider/error.ts`, which itself adapted
// from `pi-mono/packages/ai/src/utils/overflow.ts`. We keep the
// cross-provider regex set and drop a few that were defensive against
// `packages/llm`-specific error wrapping.
//
// We deliberately do NOT try to extract token counts — OpenAI's own
// `context_length_exceeded` envelope doesn't include them, and the
// per-provider message variance makes parsing unreliable.

const OVERFLOW_PATTERNS: readonly RegExp[] = [
  /prompt is too long/i, // Anthropic
  /input is too long for requested model/i, // Amazon Bedrock
  /exceeds the context window/i, // OpenAI (Completions + Responses)
  /input token count.*exceeds the maximum/i, // Google (Gemini)
  /maximum prompt length is \d+/i, // xAI (Grok)
  /reduce the length of the messages/i, // Groq
  /maximum context length is \d+ tokens/i, // OpenRouter, DeepSeek, vLLM
  /exceeds the limit of \d+/i, // GitHub Copilot
  /exceeds the available context size/i, // llama.cpp server
  /greater than the context length/i, // LM Studio
  /context window exceeds limit/i, // MiniMax
  /exceeded model token limit/i, // Kimi / Moonshot
  /context[_ ]length[_ ]exceeded/i, // generic fallback
  /request entity too large/i, // HTTP 413 reason phrase
  /context length is only \d+ tokens/i, // vLLM
  /input length.*exceeds.*context length/i, // vLLM
  /prompt too long; exceeded (?:max )?context length/i, // Ollama
  /too large for model with \d+ maximum context length/i, // Mistral
  /model_context_window_exceeded/i, // z.ai (surfaced as error text)
];

// Cerebras / Mistral on overflow sometimes throw 400 or 413 with NO body.
// Their AI SDK wrapper turns this into a message like:
//   "400 status code (no body)" or "413 (no body)"
const EMPTY_BODY_OVERFLOW = /^4(00|13)\s*(status code)?\s*\(no body\)/i;

/**
 * Detect a context-overflow failure from an upstream error.
 *
 * Inputs we recognize:
 *   - `message`: the AI SDK `APICallError.message` (or any error string).
 *   - `status`:  HTTP status. 413 is always overflow per OpenAI's contract.
 *   - `body`:    parsed JSON body, if any. We check `body.error.code` for
 *                provider-emitted overflow codes.
 */
export function isContextOverflow(input: { message?: string; status?: number; body?: unknown }): boolean {
  if (input.status === 413) return true;

  if (input.body && typeof input.body === 'object') {
    const errCode = (input.body as { error?: { code?: unknown } }).error?.code;
    if (errCode === 'context_length_exceeded' || errCode === 'model_context_window_exceeded') {
      return true;
    }
  }

  const msg = input.message ?? '';
  if (!msg) return false;
  if (EMPTY_BODY_OVERFLOW.test(msg)) return true;
  return OVERFLOW_PATTERNS.some((p) => p.test(msg));
}

/** The canonical envelope-side shape we emit for any detected overflow. */
export const CONTEXT_OVERFLOW_ENVELOPE = {
  status: 400 as const,
  code: 'context_length_exceeded' as const,
  type: 'invalid_request_error' as const,
  param: 'messages' as const,
};
