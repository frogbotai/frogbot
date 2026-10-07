import { sanitize } from './sanitize.js';
import type { FrogBotSanitizedConfig } from './sanitized.js';
import type { FrogBotConfig } from './types.js';

export type { FrogBotSanitizedConfig };

const GLOBALS_ERROR = '[frogbot] `globals` is not a FrogBot concept. Use collections instead.';

function validate(config: FrogBotConfig): void {
  if (!config.secret || typeof config.secret !== 'string') {
    throw new Error('[frogbot] `secret` is required and must be a string.');
  }

  if (!config.db) {
    throw new Error('[frogbot] `db` is required. Pass a database adapter.');
  }

  if (!Array.isArray(config.collections)) {
    throw new Error('[frogbot] `collections` is required and must be an array.');
  }

  if ('globals' in config && config.globals !== undefined) {
    throw new Error(GLOBALS_ERROR);
  }
}

function stripPluginGlobals(config: FrogBotConfig): FrogBotConfig {
  if (!('globals' in config)) return config;

  const { globals, ...rest } = config;

  if (globals !== undefined && !(Array.isArray(globals) && globals.length === 0)) {
    throw new Error(GLOBALS_ERROR);
  }

  return rest;
}

async function runPlugins(config: FrogBotConfig): Promise<FrogBotConfig> {
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

function validatePluginMarkers(config: FrogBotConfig): FrogBotConfig {
  if (
    !config._roles?.configured ||
    config.collections.some(
      (collection) => collection.auth !== undefined && collection.auth !== false,
    )
  ) {
    return config;
  }

  const onInit =
    config.onInit === undefined
      ? []
      : Array.isArray(config.onInit)
        ? config.onInit
        : [config.onInit];

  return {
    ...config,
    onInit: [
      ...onInit,
      (frogbot) => {
        frogbot.logger.warn(
          '[plugin-roles] No auth-enabled collection is configured; role assignments are unavailable.',
        );
      },
    ],
  };
}

/**
 * Build and validate a FrogBot configuration.
 *
 * Pipeline:
 *   1. Validate required fields (`secret`, `db`, `collections`), reject
 *      `globals`.
 *   2. Run plugins serially in array order, then strip the empty
 *      `globals` list some plugins return (a non-empty one is rejected).
 *   3. Sanitize — inject the `req.frogbot` bootstrap hook, wrap
 *      endpoints, produce FrogBotSanitizedConfig.
 */
export async function buildConfig(config: FrogBotConfig): Promise<FrogBotSanitizedConfig> {
  validate(config);
  const transformed = validatePluginMarkers(stripPluginGlobals(await runPlugins(config)));

  return sanitize(transformed);
}
