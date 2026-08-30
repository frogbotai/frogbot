export const PROVIDER_NAMES = [
  'openai',
  'anthropic',
  'google',
  'bedrock',
  'groq',
  'mistral',
  'cohere',
  'togetherai',
  'fireworks',
  'deepinfra',
  'xai',
  'perplexity',
  'cerebras',
  'voyage',
  'replicate',
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(provider: string): provider is ProviderName {
  return PROVIDER_NAMES.some((name) => name === provider);
}
