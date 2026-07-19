import { extractReasoningMetadata } from './extractReasoningMetadata.js';

export function toAnthropicReasoning(
  reasoning: Array<{ type: string; text?: string; providerMetadata?: Record<string, Record<string, unknown>> }>,
) {
  if (reasoning.length === 0) return undefined;
  return reasoning
    .filter((r) => r.type === 'reasoning' && typeof r.text === 'string')
    .map((r) => ({
      text: r.text as string,
      ...extractReasoningMetadata(r.providerMetadata),
    }));
}
