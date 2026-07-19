import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

const inputTextPartSchema = z.object({
  type: z.literal('input_text'),
  text: z.string(),
}).loose();

const inputImagePartSchema = z.object({
  type: z.literal('input_image'),
  image_url: z.string().nullish(),
  file_id: z.string().nullish(),
  detail: z.string().nullish(),
}).loose();

const inputFilePartSchema = z.object({
  type: z.literal('input_file'),
  file_url: z.string().nullish(),
  file_data: z.string().nullish(),
  file_id: z.string().nullish(),
  filename: z.string().nullish(),
}).loose();

const inputAudioPartSchema = z.object({
  type: z.literal('input_audio'),
  input_audio: z.object({
    data: z.string().min(1),
    format: z.string(),
  }).loose(),
}).loose();

const outputTextPartSchema = z.object({
  type: z.literal('output_text'),
  text: z.string(),
}).loose();

const unknownInputPartSchema = z.object({ type: z.string() }).loose();

const messageSchema = z.object({
  role: z.union([z.literal('system'), z.literal('developer'), z.literal('user'), z.literal('assistant')]),
  content: z.union([
    z.string(),
    z.array(z.union([
      inputTextPartSchema,
      inputImagePartSchema,
      inputFilePartSchema,
      inputAudioPartSchema,
      outputTextPartSchema,
      unknownInputPartSchema,
    ])).min(1),
  ]),
}).loose();

// Non-message input items (OpenAI Responses tool loop). A `function_call`
// carries the model's tool request from a prior turn; `function_call_output`
// carries the client's tool result; `reasoning` replays prior reasoning
// (incl. ZDR `encrypted_content`); `item_reference` points at a stored item.
const functionCallItemSchema = z.object({
  type: z.literal('function_call'),
  id: z.string().nullish(),
  call_id: z.string().min(1, 'function_call.call_id is required'),
  name: z.string().min(1, 'function_call.name is required'),
  arguments: z.string(),
  status: z.string().nullish(),
}).loose();

const functionCallOutputItemSchema = z.object({
  type: z.literal('function_call_output'),
  id: z.string().nullish(),
  call_id: z.string().min(1, 'function_call_output.call_id is required'),
  output: z.string(),
  status: z.string().nullish(),
}).loose();

const reasoningSummaryPartSchema = z.object({
  type: z.string(),
  text: z.string(),
}).loose();

const reasoningItemSchema = z.object({
  type: z.literal('reasoning'),
  id: z.string().nullish(),
  summary: z.array(reasoningSummaryPartSchema).nullish(),
  encrypted_content: z.string().nullish(),
  status: z.string().nullish(),
}).loose();

const itemReferenceSchema = z.object({
  type: z.literal('item_reference'),
  id: z.string().min(1, 'item_reference.id is required'),
}).loose();

const inputItemSchema = z.union([
  messageSchema,
  functionCallItemSchema,
  functionCallOutputItemSchema,
  reasoningItemSchema,
  itemReferenceSchema,
]);

// Function tool definition. The OpenAI Responses API uses a flat shape
// (`{ type, name, description, parameters, strict }`) — distinct from the
// nested `{ type, function: { name, ... } }` shape of chat completions.
const functionToolSchema = z.object({
  type: z.literal('function'),
  name: z.string().min(1, 'tool name is required'),
  description: z.string().nullish(),
  parameters: z.record(z.string(), z.unknown()).nullish(),
  strict: z.boolean().nullish(),
}).loose();

// Catch-all for non-function (hosted) tool types (web_search, file_search,
// code_interpreter, image_generation, mcp, ...). Accepted at the boundary;
// translation lives in toResponsesTools (forwarded as provider-defined tools
// on OpenAI, rejected 400 on other providers).
const unknownToolSchema = z.object({ type: z.string() }).loose();

const toolSchema = z.union([functionToolSchema, unknownToolSchema]);

// Loosened to z.unknown() — Responses tool_choice accepts strings
// (`none`/`auto`/`required`) and named/hosted objects. Translation lives in
// the handler's toResponsesToolChoice.
const toolChoiceSchema = z.unknown();

// Structured output — `text.format` carries the json_schema config. Loosened
// so hosted/verbosity fields survive; translation lives in the handler.
const textConfigSchema = z.object({
  verbosity: z.string().nullish(),
  format: z.object({
    type: z.string(),
    name: z.string().nullish(),
    schema: z.record(z.string(), z.unknown()).nullish(),
    strict: z.boolean().nullish(),
    description: z.string().nullish(),
  }).loose().nullish(),
}).loose();

// Reasoning controls (`reasoning.{effort,summary}`). Loosened so forward-compat
// sub-keys other gateways accept (`enabled`/`max_tokens`/`exclude`) survive;
// translation to providerOptions.openai lives in the handler.
const reasoningConfigSchema = z.object({
  effort: z.string().nullish(),
  summary: z.string().nullish(),
}).loose();

export const responsesRequestSchema = z.object({
  model: z.string().min(1, 'model is required'),
  input: z.union([z.string(), z.array(inputItemSchema).min(1, 'input must contain at least one message')]),
  instructions: z.string().nullish(),
  previous_response_id: z.string().nullish(),
  temperature: z.number().nullish(),
  top_p: z.number().nullish(),
  top_k: z.number().nullish(),
  max_output_tokens: z.number().int().positive().nullish(),
  frequency_penalty: z.number().min(-2).max(2).nullish(),
  presence_penalty: z.number().min(-2).max(2).nullish(),
  seed: z.number().int().nullish(),
  stop: z.union([z.string(), z.array(z.string())]).nullish(),
  tools: z.array(toolSchema).nullish(),
  tool_choice: toolChoiceSchema,
  parallel_tool_calls: z.boolean().nullish(),
  reasoning: reasoningConfigSchema.nullish(),
  text: textConfigSchema.nullish(),
  stream: z.boolean().nullish(),
  user: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  store: z.boolean().nullish(),
  truncation: z.enum(['auto', 'disabled']).nullish(),
  service_tier: z.enum(['auto', 'flex', 'priority', 'default']).nullish(),
  include: z.array(z.string()).nullish(),
  prompt_cache_key: z.string().nullish(),
  prompt_cache_retention: z.enum(['in_memory', '24h']).nullish(),
  safety_identifier: z.string().nullish(),
  max_tool_calls: z.number().int().nullish(),
}).loose();

export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;
export type ResponsesInputMessage = z.infer<typeof messageSchema>;
export type ResponsesInputItem = z.infer<typeof inputItemSchema>;
export type ResponsesFunctionTool = z.infer<typeof functionToolSchema>;
export type ResponsesTextConfig = z.infer<typeof textConfigSchema>;

export function parseResponsesRequest(input: unknown): ResponsesRequest {
  return parseWithSchema(responsesRequestSchema, input);
}
