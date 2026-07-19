// Zod schema for `POST /v1/chat/completions` request bodies.
//
// ---------------------------------------------------------------------------
// Philosophy — "limited schema" pattern, ported from the AI SDK
// ---------------------------------------------------------------------------
// The Vercel AI SDK's own OpenAI-compatible parser (line 757 of
// openai-compatible-chat-language-model.ts) documents this exact approach:
//
//   // limited version of the schema, focussed on what is needed
//   // this approach limits breakages when the API changes
//
// Applied here for INBOUND validation:
//   - Every z.object() uses .loose() — unknown fields survive instead
//     of being stripped or rejected. Mirrors z.looseObject() semantics.
//   - Optional/provider-specific fields use .nullish() so missing or
//     null values from one provider don't break requests from another.
//   - Role/content-part discrimination uses z.union() + a catch-all arm so
//     unknown roles (legacy `function`, vendor-specific) reach the
//     translator's switch() rather than producing a generic "Invalid input".
//   - Audio format is z.string(), not z.enum([...]). Format validation
//     lives in the translator's AUDIO_FORMAT_MIME lookup which produces a
//     precise UnsupportedModalityError with the exact param path.
//
// What we DO enforce at the schema level (structural invariants only):
//   - model: required non-empty string — nothing routes without it.
//   - messages: non-empty array — nothing to translate otherwise.
//   - tool_call_id on tool messages — required for result correlation.
//   - tool_call.id / function.name / function.arguments — required for
//     tool-call parse and tool-name map.
//   - image_url.url / input_audio.data — required non-empty.
//
// What we deliberately DON'T validate here (translator's job):
//   - data: URL well-formedness.
//   - tool_call.function.arguments JSON validity.
//   - Audio format support (AUDIO_FORMAT_MIME lookup).
//   - Unknown content-part types (UnsupportedModalityError with param path).
//   - Cross-message constraints.

import { z } from 'zod';

import { RequestValidationError } from '../../errors/gatewayError.js';
import { formatZodPath } from '../../shared/formatZodPath.js';

// ---------------------------------------------------------------------------
// Content part schemas (user messages)
// ---------------------------------------------------------------------------

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).loose();

const imagePartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().min(1, 'image_url.url must be a non-empty string'),
    detail: z.string().nullish(),
  }).loose(),
}).loose();

const inputAudioPartSchema = z.object({
  type: z.literal('input_audio'),
  input_audio: z.object({
    data: z.string().min(1, 'input_audio.data must be a non-empty base64 string'),
    // z.string() not z.enum — format validation belongs in the translator's
    // AUDIO_FORMAT_MIME lookup, which emits UnsupportedModalityError + param.
    format: z.string(),
  }).loose(),
}).loose();

const filePartSchema = z.object({
  type: z.literal('file'),
  file: z.object({
    filename: z.string().nullish(),
    file_data: z.string().nullish(),
    file_id: z.string().nullish(),
  }).loose(),
}).loose();

// Catch-all for content parts with unknown `type` values (e.g. `video`,
// provider-specific types). Reaches the translator's default branch which
// throws UnsupportedModalityError with the exact param path.
const unknownContentPartSchema = z.object({
  type: z.string(),
}).loose();

const userContentPartSchema = z.union([
  textPartSchema,
  imagePartSchema,
  inputAudioPartSchema,
  filePartSchema,
  unknownContentPartSchema,
]);

// ---------------------------------------------------------------------------
// Tool-call shape (assistant messages)
// ---------------------------------------------------------------------------

const toolCallSchema = z.object({
  id: z.string().min(1, 'tool_call.id must be a non-empty string'),
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1, 'tool_call.function.name must be a non-empty string'),
    arguments: z.string(),
  }).loose(),
}).loose();

// Message schemas
//
// Known roles use z.discriminatedUnion for precise per-field error reporting.
// Unknown roles (legacy `function`, vendor-specific, etc.) are handled in
// `parseChatCompletionRequest` via a two-pass approach: try the strict
// discriminated union first; if it fails ONLY because the role is unrecognised
// (discriminator mismatch), accept the message via the loose catch-all schema
// instead. This gives us:
//   - Precise errors: `{ role: 'tool', content: 'x' }` (no tool_call_id)
//     → param = messages[N].tool_call_id
//   - Unknown role tolerance: `{ role: 'function', content: '...' }`
//     → passes validation, forwarded as system by the translator

// `name` (system/user/assistant): accepted for wire compatibility but
// INTENTIONALLY DROPPED by the translators (G55). The AI SDK's ModelMessage
// format has no participant-name concept, so there is no upstream mapping —
// this is parity with the AI SDK's own converters, not an oversight.

const systemMessageSchema = z.object({
  role: z.union([z.literal('system'), z.literal('developer')]),
  content: z.union([z.string(), z.array(textPartSchema)]),
  name: z.string().nullish(),
}).loose();

const userMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(userContentPartSchema).min(1, 'user content array must be non-empty')]),
  name: z.string().nullish(),
}).loose();

const assistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.union([z.string(), z.null(), z.array(textPartSchema)]).nullish(),
  reasoning_content: z.string().nullish(),
  tool_calls: z.array(toolCallSchema).nullish(),
  // Re-ingested refusals are preserved as a text part (G55) — the AI SDK has
  // no refusal content-part type on the input side.
  refusal: z.union([z.string(), z.null()]).nullish(),
  name: z.string().nullish(),
}).loose();

const toolMessageSchema = z.object({
  role: z.literal('tool'),
  content: z.union([z.string(), z.array(textPartSchema)]),
  tool_call_id: z.string().min(1, 'tool message tool_call_id is required'),
}).loose();

export const knownMessageSchema = z.discriminatedUnion('role', [
  systemMessageSchema,
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
]);

// Catch-all for messages whose role is not in the known set. Only used in the
// two-pass parse logic below — never composed into a z.union with
// knownMessageSchema to avoid z.union error-reporting ambiguity.
export const unknownMessageSchema = z.object({
  role: z.string(),
  content: z.unknown().nullish(),
}).loose();

// Union type for the parsed message (used only for ChatCompletionRequest type).
const messageSchema = z.union([knownMessageSchema, unknownMessageSchema]);

// ---------------------------------------------------------------------------
// Tool definition (request-level)
// ---------------------------------------------------------------------------

const toolDefinitionSchema = z.object({
  type: z.string(), // loosened: forward-compat with non-`function` tool types
  // `function` is nullish so non-`function` tool types don't fail here with a
  // misleading `tools[N].function` param — the translator rejects them with
  // the correct `tools[N].type` param instead.
  function: z.object({
    name: z.string().min(1),
    description: z.string().nullish(),
    parameters: z.record(z.string(), z.unknown()).nullish(),
    strict: z.boolean().nullish(),
  }).loose().nullish(),
}).loose();

// Loosened to z.unknown() so extended values pass through to the forwarding
// path without causing 400s from clients that send provider-specific
// tool_choice shapes (e.g. OpenRouter's `{ type: 'function', function: {...}, disable_parallel_tool_use: true }`).
const toolChoiceSchema = z.unknown();

// ---------------------------------------------------------------------------
// Top-level request
// ---------------------------------------------------------------------------

// stream_options — OpenAI streaming usage/obfuscation controls. `.loose()` so
// unknown nested keys survive (limited-schema philosophy); `.nullish()` so an
// absent or null value is accepted.
const streamOptionsSchema = z.object({
  include_usage: z.boolean().nullish(),
  include_obfuscation: z.boolean().nullish(),
}).loose().nullish();

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1, 'model is required'),
  messages: z.array(messageSchema).min(1, 'messages must contain at least one message'),

  // Sampling params — leave value ranges to the provider.
  temperature: z.number().nullish(),
  top_k: z.number().int().nullish(),
  top_p: z.number().nullish(),
  max_tokens: z.number().int().positive().nullish(),
  max_completion_tokens: z.number().int().positive().nullish(),
  stop: z.union([z.string(), z.array(z.string())]).nullish(),
  presence_penalty: z.number().nullish(),
  frequency_penalty: z.number().nullish(),
  n: z.number().int().positive().nullish(),
  seed: z.number().int().nullish(),
  user: z.string().nullish(),

  // Streaming switch.
  stream: z.boolean().nullish(),

  // Streaming usage/obfuscation controls (OpenAI `stream_options`).
  stream_options: streamOptionsSchema,

  // Reasoning effort for o-series / reasoning models. Forwarded to the SDK's
  // provider namespace (OpenAI reads `reasoningEffort`).
  reasoning_effort: z.string().nullish(),

  // Tools — typed here for forward compat and forwarded by the handler.
  tools: z.array(toolDefinitionSchema).nullish(),
  tool_choice: toolChoiceSchema,
  parallel_tool_calls: z.boolean().nullish(),

  // Structured output — loosened to z.unknown() for forward compat.
  // Providers send extended shapes
  // (e.g. `{ type: 'json_schema', json_schema: {...} }`) that would 400
  // with a tight enum.
  response_format: z.unknown(),
  logit_bias: z.record(z.string(), z.number()).nullish(),
  logprobs: z.boolean().nullish(),
}).loose();

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

// ---------------------------------------------------------------------------
// Parse helper — throws `RequestValidationError` per issue
// ---------------------------------------------------------------------------

// The set of roles handled by knownMessageSchema's discriminatedUnion.
const KNOWN_ROLES = new Set(['system', 'developer', 'user', 'assistant', 'tool']);

/**
 * Validate an unknown body against the chat-completions schema. Throws a
 * `RequestValidationError` for the FIRST issue (route-level error handler
 * emits a single error per response, matching OpenAI's behavior). The
 * additional issues are appended to the message for diagnostic context.
 *
 * Two-pass message validation:
 * 1. Try the strict discriminatedUnion for known roles — produces precise
 *    per-field errors (e.g. param=messages[0].tool_call_id).
 * 2. If the role is not in the known set, accept via the loose catch-all
 *    schema — unknown roles are forwarded by the translator as system.
 * This avoids z.union ambiguity in error reporting while preserving tolerance.
 */
export function parseChatCompletionRequest(body: unknown): ChatCompletionRequest {
  // Validate the outer envelope with messages as raw unknowns first, so we
  // get clean top-level errors (missing model, etc.) before diving into
  // per-message validation.
  const outerResult = chatCompletionRequestSchema.safeParse(body);
  if (!outerResult.success) {
    // Filter out message-level issues so we can re-run them with the
    // two-pass logic below. Collect non-message issues first.
    const nonMessageIssues = outerResult.error.issues.filter(
      (i) => i.path[0] !== 'messages' || i.path.length === 1,
    );
    if (nonMessageIssues.length > 0) {
      const first = nonMessageIssues[0]!;
      const path = formatZodPath(first.path);
      const message =
        nonMessageIssues.length === 1
          ? first.message
          : `${first.message} (and ${nonMessageIssues.length - 1} more validation issue${nonMessageIssues.length - 1 === 1 ? '' : 's'})`;
      throw new RequestValidationError({ message, param: path });
    }
  }

  // Per-message two-pass validation (only runs if outer passed or failed only
  // on message fields).
  const rawMessages = (body as Record<string, unknown>)?.messages;
  if (Array.isArray(rawMessages)) {
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      const role = (msg as Record<string, unknown>)?.role;
      if (typeof role === 'string' && !KNOWN_ROLES.has(role)) {
        // Unknown role — validate only as loose catch-all (always passes if
        // role is a string), skip strict check.
        continue;
      }
      // Known role — validate strictly for precise per-field errors.
      const r = knownMessageSchema.safeParse(msg);
      if (!r.success) {
        const first = r.error.issues[0]!;
        const path = formatZodPath([...first.path.slice(0, 0), 'messages', i, ...first.path]);
        const message = first.message;
        throw new RequestValidationError({ message, param: path });
      }
    }
  }

  if (!outerResult.success) {
    // Remaining issues are message-array-level (e.g. empty array).
    const first = outerResult.error.issues[0]!;
    const path = formatZodPath(first.path);
    throw new RequestValidationError({ message: first.message, param: path });
  }

  return outerResult.data;
}
