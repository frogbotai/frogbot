// Canonical model ID mapping for Anthropic on AWS (Claude Platform on AWS).
//
// The provider speaks the native Anthropic Messages API (`@ai-sdk/anthropic-aws`),
// so shorthands resolve to native Anthropic model IDs — NOT Bedrock ARN-style
// IDs like `anthropic.claude-3-5-sonnet-20241022-v2:0`.

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
