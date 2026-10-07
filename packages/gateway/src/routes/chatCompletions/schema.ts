import { z } from 'zod';

import { RequestValidationError } from '../../errors/gatewayError.js';
import { formatZodPath } from '../../shared/formatZodPath.js';

const textPartSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .loose();

const imagePartSchema = z
  .object({
    type: z.literal('image_url'),
    image_url: z
      .object({
        url: z.string().min(1, 'image_url.url must be a non-empty string'),
        detail: z.string().nullish(),
      })
      .loose(),
  })
  .loose();

const inputAudioPartSchema = z
  .object({
    type: z.literal('input_audio'),
    input_audio: z
      .object({
        data: z.string().min(1, 'input_audio.data must be a non-empty base64 string'),
        format: z.string(),
      })
      .loose(),
  })
  .loose();

const filePartSchema = z
  .object({
    type: z.literal('file'),
    file: z
      .object({
        filename: z.string().nullish(),
        file_data: z.string().nullish(),
        file_id: z.string().nullish(),
      })
      .loose(),
  })
  .loose();

const unknownContentPartSchema = z
  .object({
    type: z.string(),
  })
  .loose();

const userContentPartSchema = z.union([
  textPartSchema,
  imagePartSchema,
  inputAudioPartSchema,
  filePartSchema,
  unknownContentPartSchema,
]);

const toolCallSchema = z
  .object({
    id: z.string().min(1, 'tool_call.id must be a non-empty string'),
    type: z.literal('function'),
    function: z
      .object({
        name: z.string().min(1, 'tool_call.function.name must be a non-empty string'),
        arguments: z.string(),
      })
      .loose(),
  })
  .loose();

const systemMessageSchema = z
  .object({
    role: z.union([z.literal('system'), z.literal('developer')]),
    content: z.union([z.string(), z.array(textPartSchema)]),
    name: z.string().nullish(),
  })
  .loose();

const userMessageSchema = z
  .object({
    role: z.literal('user'),
    content: z.union([
      z.string(),
      z.array(userContentPartSchema).min(1, 'user content array must be non-empty'),
    ]),
    name: z.string().nullish(),
  })
  .loose();

const assistantMessageSchema = z
  .object({
    role: z.literal('assistant'),
    content: z.union([z.string(), z.null(), z.array(textPartSchema)]).nullish(),
    reasoning_content: z.string().nullish(),
    tool_calls: z.array(toolCallSchema).nullish(),
    refusal: z.union([z.string(), z.null()]).nullish(),
    name: z.string().nullish(),
  })
  .loose();

const toolMessageSchema = z
  .object({
    role: z.literal('tool'),
    content: z.union([z.string(), z.array(textPartSchema)]),
    tool_call_id: z.string().min(1, 'tool message tool_call_id is required'),
  })
  .loose();

export const knownMessageSchema = z.discriminatedUnion('role', [
  systemMessageSchema,
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
]);

export const unknownMessageSchema = z
  .object({
    role: z.string(),
    content: z.unknown().nullish(),
  })
  .loose();

const messageSchema = z.union([knownMessageSchema, unknownMessageSchema]);

const toolDefinitionSchema = z
  .object({
    type: z.string(),
    function: z
      .object({
        name: z.string().min(1),
        description: z.string().nullish(),
        parameters: z.record(z.string(), z.unknown()).nullish(),
        strict: z.boolean().nullish(),
      })
      .loose()
      .nullish(),
  })
  .loose();

const toolChoiceSchema = z.unknown().nullish();

const streamOptionsSchema = z
  .object({
    include_usage: z.boolean().nullish(),
    include_obfuscation: z.boolean().nullish(),
  })
  .loose()
  .nullish();

export const chatCompletionRequestSchema = z
  .object({
    model: z.string().min(1, 'model is required'),
    messages: z.array(messageSchema).min(1, 'messages must contain at least one message'),

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

    stream: z.boolean().nullish(),

    stream_options: streamOptionsSchema,

    reasoning_effort: z.string().nullish(),

    tools: z.array(toolDefinitionSchema).nullish(),
    tool_choice: toolChoiceSchema,
    parallel_tool_calls: z.boolean().nullish(),

    response_format: z.unknown().nullish(),
    logit_bias: z.record(z.string(), z.number()).nullish(),
    logprobs: z.boolean().nullish(),
  })
  .loose();

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

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
  const outerResult = chatCompletionRequestSchema.safeParse(body);
  if (!outerResult.success) {
    const nonMessageIssues = outerResult.error.issues.filter(
      (i) => i.path[0] !== 'messages' || i.path.length === 1,
    );

    if (nonMessageIssues.length > 0) {
      const first = nonMessageIssues[0];
      const path = formatZodPath(first.path);
      const message =
        nonMessageIssues.length === 1
          ? first.message
          : `${first.message} (and ${nonMessageIssues.length - 1} more validation issue${nonMessageIssues.length - 1 === 1 ? '' : 's'})`;

      throw new RequestValidationError({ message, param: path });
    }
  }

  const rawMessages = (body as Record<string, unknown>)?.messages;
  if (Array.isArray(rawMessages)) {
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      const role = (msg as Record<string, unknown>)?.role;
      if (typeof role === 'string' && !KNOWN_ROLES.has(role)) {
        continue;
      }

      const r = knownMessageSchema.safeParse(msg);
      if (!r.success) {
        const first = r.error.issues[0];
        const path = formatZodPath([...first.path.slice(0, 0), 'messages', i, ...first.path]);
        const message = first.message;
        throw new RequestValidationError({ message, param: path });
      }
    }
  }

  if (!outerResult.success) {
    const first = outerResult.error.issues[0];
    const path = formatZodPath(first.path);
    throw new RequestValidationError({ message: first.message, param: path });
  }

  return outerResult.data;
}
