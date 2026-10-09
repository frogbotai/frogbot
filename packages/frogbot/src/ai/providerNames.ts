export const PROVIDER_NAMES = [
  'openai',
  'anthropic',
  'google',
  'bedrock',
  'vertex',
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
  'typesafe-ai',
  'replicate',
  'openrouter',
  'vercel',
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(provider: string): provider is ProviderName {
  return PROVIDER_NAMES.some((name) => name === provider);
}
