// Model resolution — router slug → model ID, or pass through raw model ID.

import type { SanitizedAIConfig } from '../types/ai.js';

export function resolveModel(input: string, config: SanitizedAIConfig): string {
  const routerConfig = config.routers[input];
  if (routerConfig) return routerConfig.model;
  return input;
}
