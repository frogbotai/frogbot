import type {
  AnthropicResponse,
  AnthropicResponseBlock,
  AnthropicStopReason,
  AnthropicUsage,
} from './types.js';

export type CacheCreationBreakdown = {
  ephemeral5mInputTokens?: number;
  ephemeral1hInputTokens?: number;
};

export type ToAnthropicResponseArgs = {
  text: string;
  finishReason: string;
  rawFinishReason?: string;
  stopSequence?: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    serviceTier?: string;
    thinkingTokens?: number;
    cacheCreation?: CacheCreationBreakdown;
  };
  response: { id?: string; modelId?: string; timestamp?: Date };
  toolCalls?: Array<{ toolCallId: string; toolName: string; args: unknown }>;
  reasoning?: Array<{ text: string; signature?: string; redactedData?: string }>;
  model: string;
};

export function toAnthropicResponse(args: ToAnthropicResponseArgs): AnthropicResponse {
  const {
    text,
    finishReason,
    rawFinishReason,
    stopSequence,
    usage,
    response,
    toolCalls,
    reasoning,
    model,
  } = args;

  const content: AnthropicResponseBlock[] = [];

  if (reasoning) {
    for (const r of reasoning) {
      if (r.redactedData) {
        content.push({ type: 'redacted_thinking', data: r.redactedData });
      } else {
        content.push({ type: 'thinking', thinking: r.text, signature: r.signature ?? '' });
      }
    }
  }

  if (text) {
    content.push({ type: 'text', text });
  }

  if (toolCalls) {
    for (const tc of toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.toolCallId,
        name: tc.toolName,
        input: typeof tc.args === 'string' ? safeParseJson(tc.args) : tc.args,
      });
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  return {
    id: response.id ?? `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    type: 'message',
    role: 'assistant',
    content,
    model: response.modelId ?? model,
    stop_reason: mapStopReason(finishReason, rawFinishReason),
    stop_sequence: stopSequence ?? null,
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      ...(usage.cacheCreationInputTokens !== undefined
        ? { cache_creation_input_tokens: usage.cacheCreationInputTokens }
        : {}),
      ...(usage.cacheReadInputTokens !== undefined
        ? { cache_read_input_tokens: usage.cacheReadInputTokens }
        : {}),
      ...(usage.serviceTier !== undefined ? { service_tier: usage.serviceTier } : {}),
      ...usageDetailFields(usage),
    },
  };
}

export function usageDetailFields(args: {
  thinkingTokens?: number;
  cacheCreation?: CacheCreationBreakdown;
}): Pick<AnthropicUsage, 'output_tokens_details' | 'cache_creation'> {
  return {
    ...(args.thinkingTokens !== undefined
      ? { output_tokens_details: { thinking_tokens: args.thinkingTokens } }
      : {}),
    ...(args.cacheCreation !== undefined
      ? {
          cache_creation: {
            ephemeral_5m_input_tokens: args.cacheCreation.ephemeral5mInputTokens ?? 0,
            ephemeral_1h_input_tokens: args.cacheCreation.ephemeral1hInputTokens ?? 0,
          },
        }
      : {}),
  };
}

export function extractThinkingTokens(
  rawUsage: Record<string, unknown> | undefined,
): number | undefined {
  const details = rawUsage?.output_tokens_details as Record<string, unknown> | undefined;
  const thinking = details?.thinking_tokens;

  return typeof thinking === 'number' ? thinking : undefined;
}

export function extractCacheCreation(
  rawUsage: Record<string, unknown> | undefined,
): CacheCreationBreakdown | undefined {
  const breakdown = rawUsage?.cache_creation as Record<string, unknown> | undefined;
  const ephemeral5m =
    typeof breakdown?.ephemeral_5m_input_tokens === 'number'
      ? breakdown.ephemeral_5m_input_tokens
      : undefined;

  const ephemeral1h =
    typeof breakdown?.ephemeral_1h_input_tokens === 'number'
      ? breakdown.ephemeral_1h_input_tokens
      : undefined;

  if (ephemeral5m === undefined && ephemeral1h === undefined) return undefined;

  return { ephemeral5mInputTokens: ephemeral5m, ephemeral1hInputTokens: ephemeral1h };
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

const ANTHROPIC_STOP_REASONS: ReadonlySet<string> = new Set([
  'end_turn',
  'max_tokens',
  'stop_sequence',
  'tool_use',
  'refusal',
  'pause_turn',
  'model_context_window_exceeded',
  'compaction',
] satisfies AnthropicStopReason[]);

export function mapStopReason(reason: string, rawReason?: string): AnthropicStopReason {
  if (rawReason !== undefined && ANTHROPIC_STOP_REASONS.has(rawReason)) {
    return rawReason as AnthropicStopReason;
  }

  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool-calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content-filter':
      return 'refusal';
    case 'error':
    case 'other':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}
