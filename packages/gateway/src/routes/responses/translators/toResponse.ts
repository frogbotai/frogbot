import type { ContentPart, FinishReason, LanguageModelUsage, ToolSet } from 'ai';

import { normalizeServiceTier } from '../../../shared/normalizeServiceTier.js';

type ResponsesToolCall = { toolCallId: string; toolName: string; input: unknown };

// Spec-required request-echo fields sourced from the request body. The OpenAI
// Responses envelope always carries these keys (with defaults when the client
// omitted them) — see ai/packages/openai/src/responses/
// openai-responses-language-model.test.ts response.created snapshot.
export type ResponsesEchoParams = {
  parallel_tool_calls?: boolean | null;
  tools?: unknown[] | null;
  tool_choice?: unknown;
  temperature?: number | null;
  top_p?: number | null;
  max_output_tokens?: number | null;
  instructions?: string | null;
  store?: boolean | null;
  truncation?: 'auto' | 'disabled' | null;
  text?: unknown;
  reasoning?: unknown;
  user?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function toResponsesResponse(args: {
  result: {
    text: string;
    content?: ContentPart<ToolSet>[];
    toolCalls?: ResponsesToolCall[];
    finishReason: FinishReason;
    response: { id?: string; modelId?: string; timestamp?: Date };
    usage: LanguageModelUsage;
    providerMetadata?: Record<string, Record<string, unknown>>;
  };
  model: string;
  previousResponseId?: string | null;
  body?: ResponsesEchoParams;
}) {
  const createdAt = args.result.response.timestamp
    ? Math.floor(args.result.response.timestamp.getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  const { status, incompleteDetails } = toResponseStatus(args.result.finishReason);
  const serviceTier = normalizeServiceTier(args.result.providerMetadata);
  const body = args.body ?? {};

  return {
    id: args.result.response.id ?? `resp_${crypto.randomUUID()}`,
    object: 'response',
    created_at: createdAt,
    completed_at: status === 'completed' ? createdAt : null,
    status,
    error: status === 'failed'
      ? { code: 'server_error', message: 'The model failed to generate a response.' }
      : null,
    incomplete_details: incompleteDetails,
    model: args.result.response.modelId ?? args.model,
    previous_response_id: args.previousResponseId ?? null,
    ...echoFields(body),
    ...(serviceTier ? { service_tier: serviceTier } : {}),
    output: toOutputItems(args.result),
    output_text: args.result.text,
    usage: toResponseUsage(args.result.usage),
  };
}

// Always-present spec-echo fields with OpenAI defaults. Echoes request-provided
// values when set, otherwise the wire-spec defaults.
export function echoFields(body: ResponsesEchoParams): Record<string, unknown> {
  return {
    parallel_tool_calls: body.parallel_tool_calls ?? true,
    tools: body.tools ?? [],
    tool_choice: body.tool_choice ?? 'auto',
    temperature: body.temperature ?? null,
    top_p: body.top_p ?? null,
    max_output_tokens: body.max_output_tokens ?? null,
    instructions: body.instructions ?? null,
    store: body.store ?? true,
    truncation: body.truncation ?? 'disabled',
    text: body.text ?? { format: { type: 'text' } },
    reasoning: body.reasoning ?? { effort: null, summary: null },
    user: body.user ?? null,
    metadata: body.metadata ?? null,
    input: [],
  };
}

export function toResponseStatus(finishReason: FinishReason): {
  status: 'completed' | 'incomplete' | 'failed';
  incompleteDetails: { reason: string } | null;
} {
  switch (finishReason) {
    case 'stop':
    case 'tool-calls':
      return { status: 'completed', incompleteDetails: null };
    case 'length':
      return { status: 'incomplete', incompleteDetails: { reason: 'max_output_tokens' } };
    case 'content-filter':
      return { status: 'incomplete', incompleteDetails: { reason: 'content_filter' } };
    case 'error':
    case 'other':
      return { status: 'failed', incompleteDetails: null };
    default:
      return { status: 'completed', incompleteDetails: null };
  }
}

function toOutputItems(result: {
  text: string;
  content?: ContentPart<ToolSet>[];
  toolCalls?: ResponsesToolCall[];
}): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];

  for (const part of result.content ?? []) {
    if (part.type === 'reasoning') {
      output.push(reasoningItem(part.text, reasoningEncryptedContent(part.providerMetadata)));
    }
  }

  const toolCalls = result.toolCalls ?? [];
  for (const call of toolCalls) {
    output.push({
      id: `fc_${crypto.randomUUID()}`,
      type: 'function_call',
      status: 'completed',
      call_id: call.toolCallId,
      name: call.toolName,
      arguments: typeof call.input === 'string' ? call.input : JSON.stringify(call.input ?? {}),
    });
  }

  // Always emit a message item when there is text or no tool calls — mirrors
  // Hebo's toOutputItems fall-through so an empty response still carries a
  // message item with empty output_text rather than an empty output array.
  if (result.text || toolCalls.length === 0) {
    output.push({
      id: `msg_${crypto.randomUUID()}`,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: result.text, annotations: [] }],
    });
  }

  return output;
}

function reasoningItem(text: string, encryptedContent?: string): Record<string, unknown> {
  return {
    id: `rs_${crypto.randomUUID()}`,
    type: 'reasoning',
    status: 'completed',
    summary: text ? [{ type: 'summary_text', text }] : [],
    ...(encryptedContent != null ? { encrypted_content: encryptedContent } : {}),
  };
}

// OpenAI surfaces ZDR reasoning replay tokens (requested via
// include: ["reasoning.encrypted_content"]) through the AI SDK as
// providerMetadata.openai.reasoningEncryptedContent — see
// ai/packages/openai/src/responses/openai-responses-provider-metadata.ts:20-23.
export function reasoningEncryptedContent(
  providerMetadata: Record<string, Record<string, unknown>> | undefined,
): string | undefined {
  const value = providerMetadata?.openai?.reasoningEncryptedContent;
  return typeof value === 'string' ? value : undefined;
}

export function toResponseUsage(usage: LanguageModelUsage): Record<string, unknown> {
  return {
    input_tokens: usage.inputTokens ?? 0,
    ...(usage.inputTokenDetails?.cacheReadTokens !== undefined
      ? { input_tokens_details: { cached_tokens: usage.inputTokenDetails.cacheReadTokens } }
      : {}),
    output_tokens: usage.outputTokens ?? 0,
    ...(usage.outputTokenDetails?.reasoningTokens !== undefined
      ? { output_tokens_details: { reasoning_tokens: usage.outputTokenDetails.reasoningTokens } }
      : {}),
    total_tokens: usage.totalTokens ?? 0,
  };
}
