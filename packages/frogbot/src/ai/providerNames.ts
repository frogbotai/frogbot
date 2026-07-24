export const PROVIDER_NAMES = [
  'openai',
  'anthropic',
  'google',
  'bedrock',
  'groq',
  'mistral',
  'cohere',
  'together',
  'fireworks',
  'deepinfra',
  'xai',
  'perplexity',
  'cerebras',
  'voyage',
  'replicate',
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

const GATEWAY_PROVIDER_NAMES = {
  bedrock: 'amazon-bedrock',
  together: 'togetherai',
} as const satisfies Partial<Record<ProviderName, string>>;

export function isProviderName(provider: string): provider is ProviderName {
  return PROVIDER_NAMES.some((name) => name === provider);
}

export function getGatewayProviderName(
  provider: ProviderName,
): Exclude<ProviderName, 'bedrock' | 'together'> | 'amazon-bedrock' | 'togetherai' {
  if (provider === 'bedrock') return GATEWAY_PROVIDER_NAMES.bedrock;
  if (provider === 'together') return GATEWAY_PROVIDER_NAMES.together;
  return provider;
}
