export type AnthropicAwsCanonicalId = string;

export const ANTHROPIC_AWS_CANONICAL_IDS: Record<string, AnthropicAwsCanonicalId> = {
  'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-3.5-haiku': 'claude-3-5-haiku-20241022',
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-sonnet': 'claude-3-sonnet-20240229',
  'claude-3-haiku': 'claude-3-haiku-20240307',
  'claude-4-sonnet': 'claude-sonnet-4-20250514',
  'claude-4-opus': 'claude-opus-4-20250514',
};

export function resolveAnthropicAwsModelId(modelId: string): string {
  return ANTHROPIC_AWS_CANONICAL_IDS[modelId] ?? modelId;
}
