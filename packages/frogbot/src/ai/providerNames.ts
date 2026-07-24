const GATEWAY_PROVIDER_NAMES: Record<string, string> = {
  bedrock: 'amazon-bedrock',
  together: 'togetherai',
};

export function getGatewayProviderName(provider: string): string {
  return GATEWAY_PROVIDER_NAMES[provider] ?? provider;
}
