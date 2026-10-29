import { getPlatformPlugin } from './platformPlugin.js';
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
  const plugins = (config.plugins ?? [])
    .map((plugin, index) => ({ plugin, index }))
    .sort((a, b) => (a.plugin.order ?? 0) - (b.plugin.order ?? 0));

  let current = config;

  for (const { plugin, index } of plugins) {
    try {
      current = await plugin(current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = plugin.slug ? `"${plugin.slug}"` : `at index ${index}`;

      throw new Error(`[frogbot] plugin ${name} failed: ${message}`);
    }
  }

  const platformPlugin = getPlatformPlugin();
  const listed =
    platformPlugin?.slug !== undefined &&
    plugins.some(({ plugin }) => plugin.slug === platformPlugin.slug);

  if (platformPlugin && !listed) {
    try {
      current = await platformPlugin(current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = process.env.FROGBOT_PLATFORM_PLUGIN;
      throw new Error(`[frogbot] platform plugin ${name ? `${name} ` : ''}failed: ${message}`);
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
 *   2. Run plugins serially by `order`, lowest first (ties keep array order),
 *      then the platform plugin (`frogbot/platform-plugin`) if there is one and
 *      no listed plugin has its `slug`, then strip the empty `globals` list
 *      some plugins return (a non-empty one is rejected).
 *   3. Sanitize — inject the `req.frogbot` bootstrap hook, wrap
 *      endpoints, produce FrogBotSanitizedConfig.
 */
export async function buildConfig(config: FrogBotConfig): Promise<FrogBotSanitizedConfig> {
  validate(config);
  const transformed = stripPluginGlobals(await runPlugins(config));

  return sanitize(transformed);
}
