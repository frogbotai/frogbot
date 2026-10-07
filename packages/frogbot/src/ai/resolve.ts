import type { SanitizedAIConfig } from './types.js';

export function resolveModel(input: string, config: SanitizedAIConfig): string {
  const routerConfig = config.routers[input];
  if (routerConfig) return routerConfig.model;

  return input;
}
