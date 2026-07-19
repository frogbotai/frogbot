import { normalizeToolName } from '../../../shared/normalizeToolName.js';
import { stripEmptyKeys } from '../../../shared/stripEmptyKeys.js';
import type { OpenAIChatResponse, OpenAIChoice, OpenAIReasoningDetail, OpenAIToolCall, OpenAIUsage } from './types.js';

export type UsageInput = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
};

export function toOpenAIResponse(args: {
  text: string;
  finishReason: string;
  usage: UsageInput;
  response: { id?: string; modelId?: string; timestamp?: Date; body?: unknown };
  toolCalls?: Array<{ toolCallId: string; toolName: string; args: unknown }>;
  reasoningDetails?: OpenAIReasoningDetail[];
  reasoningContent?: string;
  serviceTier?: string;
  model: string;
}): OpenAIChatResponse {
  const { text, finishReason, usage, response, toolCalls, reasoningDetails, reasoningContent, serviceTier, model } =
    args;

  const message: OpenAIChoice['message'] = {
    role: 'assistant',
    content: text || null,
  };

  // G59: generateText exposes the raw parsed provider response on
  // `response.body` (ai/packages/openai/src/chat/openai-chat-language-model.ts:421);
  // lift `choices[0].message.refusal` so non-streaming refusals stay visible.
  const refusal = extractRefusal(response.body);
  if (refusal !== undefined) {
    message.refusal = refusal;
  }

  if (reasoningContent) {
    (message as Record<string, unknown>).reasoning_content = reasoningContent;
  }

  if (reasoningDetails && reasoningDetails.length > 0) {
    (message as Record<string, unknown>).reasoning_details = reasoningDetails;
  }

  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls.map(
      (tc): OpenAIToolCall => ({
        id: tc.toolCallId,
        type: 'function',
        function: {
          name: normalizeToolName(tc.toolName),
          arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(stripEmptyKeys(tc.args)),
        },
      }),
    );
  }

  return {
    id: response.id ?? `chatcmpl-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: response.timestamp ? Math.floor(response.timestamp.getTime() / 1000) : Math.floor(Date.now() / 1000),
    model: response.modelId ?? model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: mapFinishReason(finishReason),
      },
    ],
    usage: buildUsage(usage),
    ...(serviceTier ? { service_tier: serviceTier } : {}),
  };
}

function extractRefusal(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const choices = (body as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return undefined;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) return undefined;
  const refusal = (message as Record<string, unknown>).refusal;
  return typeof refusal === 'string' && refusal.length > 0 ? refusal : undefined;
}

function buildUsage(usage: UsageInput): OpenAIUsage {
  const out: OpenAIUsage = {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
  };

  const cached = usage.inputTokenDetails?.cacheReadTokens;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens;
  if (cached !== undefined || cacheWrite !== undefined) {
    out.prompt_tokens_details = {};
    if (cached !== undefined) {
      out.prompt_tokens_details.cached_tokens = cached;
    }
    if (cacheWrite !== undefined) {
      out.prompt_tokens_details.cache_write_tokens = cacheWrite;
    }
  }

  const reasoning = usage.outputTokenDetails?.reasoningTokens;
  if (reasoning !== undefined) {
    out.completion_tokens_details = { reasoning_tokens: reasoning };
  }

  return out;
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
