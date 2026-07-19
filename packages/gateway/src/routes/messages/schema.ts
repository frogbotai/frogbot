// Zod schema for `POST /v1/messages` request bodies (Anthropic-compatible).
//
// ---------------------------------------------------------------------------
// Same "limited schema" philosophy as `chat-completions-schema.ts`:
//   - Every z.object() uses .loose() — unknown fields survive.
//   - Optional/provider-specific fields use .nullish().
//   - Content-part discrimination uses z.union() + catch-all for forward compat.
//   - Semantic validation lives in the translator, not the schema.
//
// What we DO enforce at the schema level (structural invariants only):
//   - model: required non-empty string.
//   - max_tokens: required positive integer (Anthropic mandates this).
//   - messages: non-empty array.
//   - Alternating user/assistant roles (Anthropic requirement).
//   - tool_result.tool_use_id: required for correlation.
//   - tool_use.id / name: required for tool dispatch.
//
// What we deliberately DON'T validate here (translator's job):
//   - Image source well-formedness (base64 data validity, URL reachability).
//   - Tool input JSON structure.
//   - Content block type support (UnsupportedModalityError with context).

import { z } from 'zod';

import { RequestValidationError } from '../../errors/gatewayError.js';
import { formatZodPath } from '../../shared/formatZodPath.js';

// ---------------------------------------------------------------------------
// Cache control (per-block, per-message)
// ---------------------------------------------------------------------------

const cacheControlSchema = z.object({
  type: z.literal('ephemeral'),
  ttl: z.enum(['5m', '1h', '24h']).nullish(),
}).loose();

// ---------------------------------------------------------------------------
// Content block schemas (user messages)
// ---------------------------------------------------------------------------

const textBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  cache_control: cacheControlSchema.nullish(),
}).loose();

// Anthropic media sources: base64 payload or remote URL. Documents also
// support an inline text variant (see documentBlockSchema).
const mediaSourceSchema = z.union([
  z.object({
    type: z.literal('base64'),
    media_type: z.string(),
    data: z.string(),
  }).loose(),
  z.object({
    type: z.literal('url'),
    url: z.string(),
    media_type: z.string().nullish(),
  }).loose(),
]);

const imageBlockSchema = z.object({
  type: z.literal('image'),
  source: mediaSourceSchema,
  cache_control: cacheControlSchema.nullish(),
}).loose();

// Tool results carry either a string or a mixed array of text/image sub-blocks.
const toolResultSubBlockSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }).loose(),
  z.object({ type: z.literal('image'), source: mediaSourceSchema }).loose(),
]);

const toolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string().min(1, 'tool_result.tool_use_id is required'),
  content: z.union([z.string(), z.array(toolResultSubBlockSchema)]).nullish(),
  is_error: z.boolean().nullish(),
  cache_control: cacheControlSchema.nullish(),
}).loose();

const documentBlockSchema = z.object({
  type: z.literal('document'),
  source: z.union([
    mediaSourceSchema,
    z.object({
      type: z.literal('text'),
      media_type: z.string().nullish(),
      data: z.string(),
    }).loose(),
  ]),
  title: z.string().nullish(),
  context: z.string().nullish(),
  citations: z.object({ enabled: z.boolean() }).loose().nullish(),
  cache_control: cacheControlSchema.nullish(),
}).loose();

// Catch-all for unknown user content block types
const unknownUserBlockSchema = z.object({
  type: z.string(),
}).loose();

const userContentBlockSchema = z.union([
  textBlockSchema,
  imageBlockSchema,
  toolResultBlockSchema,
  documentBlockSchema,
  unknownUserBlockSchema,
]);

// ---------------------------------------------------------------------------
// Content block schemas (assistant messages)
// ---------------------------------------------------------------------------

const assistantTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  cache_control: cacheControlSchema.nullish(),
}).loose();

const thinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string().nullish(),
}).loose();

const redactedThinkingBlockSchema = z.object({
  type: z.literal('redacted_thinking'),
  data: z.string(),
}).loose();

const toolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string().min(1, 'tool_use.id is required'),
  name: z.string().min(1, 'tool_use.name is required'),
  input: z.unknown(),
  cache_control: cacheControlSchema.nullish(),
}).loose();

const unknownAssistantBlockSchema = z.object({
  type: z.string(),
}).loose();

const assistantContentBlockSchema = z.union([
  assistantTextBlockSchema,
  thinkingBlockSchema,
  redactedThinkingBlockSchema,
  toolUseBlockSchema,
  unknownAssistantBlockSchema,
]);

// ---------------------------------------------------------------------------
// Message schemas
// ---------------------------------------------------------------------------

const userMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(userContentBlockSchema).min(1)]),
}).loose();

const assistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.union([z.string(), z.array(assistantContentBlockSchema).min(1)]),
}).loose();

const messageSchema = z.union([userMessageSchema, assistantMessageSchema]);

// ---------------------------------------------------------------------------
// System parameter (string or structured array)
// ---------------------------------------------------------------------------

const systemTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  cache_control: cacheControlSchema.nullish(),
}).loose();

const systemSchema = z.union([
  z.string(),
  z.array(systemTextBlockSchema).min(1),
]);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const toolInputSchemaSchema = z.object({
  type: z.literal('object'),
}).loose();

const toolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  input_schema: toolInputSchemaSchema.nullish(),
  cache_control: cacheControlSchema.nullish(),
  strict: z.boolean().nullish(),
}).loose();

// ---------------------------------------------------------------------------
// Thinking (extended thinking config)
// ---------------------------------------------------------------------------

// Anthropic wire format: `{ type: 'enabled', budget_tokens }` (or `disabled`).
// `.loose()` keeps forward-compat variants (e.g. `adaptive`) surviving.
const thinkingSchema = z.object({
  type: z.string(),
  budget_tokens: z.number().int().nullish(),
}).loose();

// ---------------------------------------------------------------------------
// Structured output (`output_config` GA / deprecated top-level `output_format`)
// ---------------------------------------------------------------------------

const outputFormatSchema = z.object({
  type: z.literal('json_schema'),
  schema: z.any(),
}).loose();

const outputConfigSchema = z.object({
  format: outputFormatSchema.nullish(),
  effort: z.enum(['low', 'medium', 'high', 'max']).nullish(),
}).loose();

// ---------------------------------------------------------------------------
// Remote MCP servers & code-execution container (top-level Anthropic fields)
// ---------------------------------------------------------------------------

const mcpServerSchema = z.object({
  type: z.literal('url'),
  name: z.string().min(1),
  url: z.string().min(1),
  authorization_token: z.string().nullish(),
  tool_configuration: z.object({
    enabled: z.boolean().nullish(),
    allowed_tools: z.array(z.string()).nullish(),
  }).loose().nullish(),
}).loose();

const containerSchema = z.union([
  z.string(),
  z.object({
    id: z.string().nullish(),
    skills: z.array(z.object({
      type: z.string(),
      skill_id: z.string().nullish(),
      version: z.string().nullish(),
    }).loose()).nullish(),
  }).loose(),
]);

// ---------------------------------------------------------------------------
// Top-level request
// ---------------------------------------------------------------------------

export const messagesRequestSchema = z.object({
  model: z.string().min(1, 'model is required'),
  messages: z.array(messageSchema).min(1, 'messages must contain at least one message'),
  max_tokens: z.number().int().positive('max_tokens must be a positive integer'),

  // Optional parameters
  system: systemSchema.nullish(),
  temperature: z.number().nullish(),
  top_p: z.number().nullish(),
  top_k: z.number().int().nullish(),
  stop_sequences: z.array(z.string()).nullish(),
  stream: z.boolean().nullish(),
  thinking: thinkingSchema.nullish(),
  service_tier: z.enum(['auto', 'standard_only']).nullish(),
  output_config: outputConfigSchema.nullish(),
  output_format: outputFormatSchema.nullish(),
  cache_control: cacheControlSchema.nullish(),
  mcp_servers: z.array(mcpServerSchema).nullish(),
  container: containerSchema.nullish(),
  context_management: z.unknown().nullish(),
  metadata: z.object({
    user_id: z.string().nullish(),
  }).loose().nullish(),

  // Tools
  tools: z.array(toolDefinitionSchema).nullish(),
  tool_choice: z.unknown().nullish(),
}).loose();

export type MessagesRequest = z.infer<typeof messagesRequestSchema>;

// ---------------------------------------------------------------------------
// Parse helper
// ---------------------------------------------------------------------------

export function parseMessagesRequest(body: unknown): MessagesRequest {
  const result = messagesRequestSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = formatZodPath(first.path);
    throw new RequestValidationError({ message: first.message, param: path });
  }
  return result.data;
}
