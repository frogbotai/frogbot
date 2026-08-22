/**
 * Locates and loads a project's `frogbot.config.{ts,js,mjs}` from the
 * filesystem and returns its sanitized config (the awaited default
 * export). Internal to the CLI; never exported publicly.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { InitOptions } from '../frogbot.js';
import type { FrogbotSanitizedConfig } from '../types/sanitized.js';
import type { ValidationMode } from './validationContext.js';
import { runWithValidationMode } from './validationContext.js';
import { findConfigFile, resolveEnvConfigPath } from './resolveConfigPath.js';

export { resolveConfigDir } from './resolveConfigPath.js';

function isSanitizedConfig(value: unknown): value is FrogbotSanitizedConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { collections?: unknown }).collections) &&
    '_internal' in value
  );
}

export async function loadConfig({
  cwd,
  mode = 'runtime',
}: {
  cwd: string;
  mode?: ValidationMode;
}): Promise<InitOptions['config']> {
  const configPath = resolveEnvConfigPath(cwd) ?? findConfigFile(cwd);
  if (!configPath) {
    throw new Error(
      `[frogbot] could not find frogbot.config.{ts,js,mjs} in ${cwd}, ${join(cwd, 'src')}, or any parent directory (set FROGBOT_CONFIG_PATH to override)`,
    );
  }

  let mod: { default?: unknown };
  try {
    mod = await runWithValidationMode({
      mode,
      load: () => import(pathToFileURL(configPath).href) as Promise<{ default?: unknown }>,
    });
  } catch (cause) {
    throw new Error(`[frogbot] failed to load ${configPath}`, { cause });
  }

  if (mod.default === undefined) {
    throw new Error(`[frogbot] ${configPath} has no default export`);
  }

  const resolved = await Promise.resolve(mod.default);

  if (!isSanitizedConfig(resolved)) {
    throw new Error(
      `[frogbot] ${configPath} default export is not a FrogbotSanitizedConfig (missing collections array or _internal)`,
    );
  }

  return resolved;
}
