/**
 * Locates and loads a project's `frogbot.config.{ts,js,mjs}` from the
 * filesystem and returns its sanitized config (the awaited default
 * export). Internal to the CLI; never exported publicly.
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

import type { FrogbotSanitizedConfig } from '../types/sanitized.js';
import type { InitOptions } from '../frogbot.js';

const CONFIG_FILENAMES = ['frogbot.config.ts', 'frogbot.config.mjs', 'frogbot.config.js'] as const;

function resolveEnvConfigPath(cwd: string): string | null {
  const fromEnv = process.env.FROGBOT_CONFIG_PATH;
  if (!fromEnv) return null;
  const abs = isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv);
  if (!existsSync(abs)) {
    throw new Error(`[frogbot] FROGBOT_CONFIG_PATH points to a missing file: ${abs}`);
  }
  return abs;
}

function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isSanitizedConfig(value: unknown): value is FrogbotSanitizedConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { collections?: unknown }).collections) &&
    '_internal' in (value as object)
  );
}

export async function loadConfig(cwd: string): Promise<InitOptions['config']> {
  const configPath = resolveEnvConfigPath(cwd) ?? findConfigFile(cwd);
  if (!configPath) {
    throw new Error(
      `[frogbot] could not find frogbot.config.{ts,js,mjs} in ${cwd} or any parent directory (set FROGBOT_CONFIG_PATH to override)`,
    );
  }

  let mod: { default?: unknown };
  try {
    mod = (await tsImport(pathToFileURL(configPath).href, import.meta.url)) as {
      default?: unknown;
    };
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
