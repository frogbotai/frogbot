// FrogBot's public entry point for config.
//
// `buildConfig` validates the FrogBot-shaped config, runs the plugin
// pipeline serially, sanitizes the result, and returns a
// `FrogbotSanitizedConfig`. This is what the config file's default
// export resolves to.

import { sanitize } from './sanitize.js';
import type { FrogbotConfig } from '../types/config.js';
import type { FrogbotSanitizedConfig } from '../types/sanitized.js';

export type { FrogbotSanitizedConfig };

function validate(config: FrogbotConfig): void {
  if (!config.secret || typeof config.secret !== 'string') {
    throw new Error('[frogbot] `secret` is required and must be a string.');
  }
  if (!config.db) {
    throw new Error('[frogbot] `db` is required. Pass a database adapter.');
  }
  if (!Array.isArray(config.collections)) {
    throw new Error('[frogbot] `collections` is required and must be an array.');
  }
  if ((config as unknown as Record<string, unknown>).globals !== undefined) {
    throw new Error('[frogbot] `globals` is not a FrogBot concept. Use collections instead.');
  }
}

async function runPlugins(config: FrogbotConfig): Promise<FrogbotConfig> {
  const plugins = config.plugins ?? [];
  let current = config;
  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];
    try {
      current = await plugin(current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[frogbot] plugin at index ${i} failed: ${message}`);
    }
  }
  return current;
}

/**
 * Build and validate a FrogBot configuration.
 *
 * Pipeline:
 *   1. Validate required fields (`secret`, `db`, `collections`), reject
 *      `globals`.
 *   2. Run plugins serially in array order.
 *   3. Sanitize — inject the `req.frogbot` bootstrap hook, wrap
 *      endpoints, produce FrogbotSanitizedConfig.
 */
export async function buildConfig(config: FrogbotConfig): Promise<FrogbotSanitizedConfig> {
  validate(config);
  const transformed = await runPlugins(config);
  return sanitize(transformed);
}
