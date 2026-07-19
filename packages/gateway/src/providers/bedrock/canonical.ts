// Canonical model ID mapping for Amazon Bedrock.
//
// Bedrock uses full ARN-style model IDs (e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`)
// but users can also specify inference profiles or cross-region profiles.
// This module provides a mapping from friendly shorthand IDs to full Bedrock model IDs.

export type BedrockCanonicalId = string;

/**
 * Maps shorthand model identifiers to their full Bedrock model IDs.
 * Users can always pass the full ID directly — this table provides convenience aliases.
 */
export const BEDROCK_CANONICAL_IDS: Record<string, BedrockCanonicalId> = {
  // Anthropic Claude
  'claude-3.5-sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'claude-3.5-haiku': 'anthropic.claude-3-5-haiku-20241022-v1:0',
  'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
  'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
  'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
  'claude-4-sonnet': 'anthropic.claude-sonnet-4-20250514-v1:0',
  'claude-4-opus': 'anthropic.claude-opus-4-20250514-v1:0',

  // Amazon Nova
  'nova-pro': 'amazon.nova-pro-v1:0',
  'nova-lite': 'amazon.nova-lite-v1:0',
  'nova-micro': 'amazon.nova-micro-v1:0',

  // Meta Llama
  'llama-3.3-70b': 'meta.llama3-3-70b-instruct-v1:0',
  'llama-3.2-90b': 'meta.llama3-2-90b-instruct-v1:0',
  'llama-3.2-11b': 'meta.llama3-2-11b-instruct-v1:0',
  'llama-3.2-3b': 'meta.llama3-2-3b-instruct-v1:0',
  'llama-3.2-1b': 'meta.llama3-2-1b-instruct-v1:0',

  // Mistral
  'mistral-large': 'mistral.mistral-large-2407-v1:0',

  // Cohere
  'command-r-plus': 'cohere.command-r-plus-v1:0',
  'command-r': 'cohere.command-r-v1:0',
};

/**
 * Resolve a potentially shorthand model ID to the full Bedrock canonical form.
 * If the input is already a full ID (contains a dot), it passes through unchanged.
 */
export function resolveBedrockModelId(modelId: string): string {
  return BEDROCK_CANONICAL_IDS[modelId] ?? modelId;
}
