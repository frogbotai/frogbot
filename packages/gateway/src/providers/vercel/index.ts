// Provider definition: Vercel AI Gateway.
//
// `apiKey` is a required key so the adapter never falls back to Vercel's OIDC
// deployment token: a Vercel deployment alone must not enable this provider.

import { createGateway, type GatewayProvider, type GatewayProviderSettings } from '@ai-sdk/gateway';

import type { ProviderDefinition } from '../types.js';

export type VercelConfig = Omit<GatewayProviderSettings, 'apiKey' | 'fetch' | '_internal'> & {
  apiKey?: string;
};

const VERCEL_ATTRIBUTION_HEADERS: Record<string, string> = {
  'http-referer': 'https://www.frogbot.ai',
  'x-title': 'FrogBot',
};

function withAttribution(headers: Record<string, string> = {}): Record<string, string> {
  const overridden = new Set(Object.keys(headers).map((name) => name.toLowerCase()));

  const defaults = Object.entries(VERCEL_ATTRIBUTION_HEADERS).filter(
    ([name]) => !overridden.has(name),
  );

  return { ...Object.fromEntries(defaults), ...headers };
}

export const vercelProvider = {
  name: 'vercel',
  credentials: [{ apiKey: 'AI_GATEWAY_API_KEY' }],
  envVars: ['AI_GATEWAY_API_KEY', 'AI_GATEWAY_BASE_URL'],
  fromEnv: (env) => {
    if (!env.AI_GATEWAY_API_KEY) return undefined;

    return {
      apiKey: env.AI_GATEWAY_API_KEY,
      ...(env.AI_GATEWAY_BASE_URL && { baseURL: env.AI_GATEWAY_BASE_URL }),
    };
  },
  build: (cfg) => createGateway({ ...cfg, headers: withAttribution(cfg.headers) }),
} satisfies ProviderDefinition<'vercel', VercelConfig, GatewayProvider>;
