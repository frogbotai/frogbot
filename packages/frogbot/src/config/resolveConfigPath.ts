import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const CONFIG_FILENAMES = ['frogbot.config.ts', 'frogbot.config.mjs', 'frogbot.config.js'] as const;

export function resolveEnvConfigPath(cwd: string): string | null {
  const fromEnv = process.env.FROGBOT_CONFIG_PATH;
  if (!fromEnv) return null;
  const abs = isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv);
  if (!existsSync(abs)) {
    throw new Error(`[frogbot] FROGBOT_CONFIG_PATH points to a missing file: ${abs}`);
  }
  return abs;
}

export function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    for (const subDir of ['src', '.']) {
      for (const name of CONFIG_FILENAMES) {
        const candidate = join(dir, subDir, name);
        if (existsSync(candidate)) return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveConfigDir(cwd: string): string | null {
  const fromEnv = process.env.FROGBOT_CONFIG_PATH;
  if (fromEnv) {
    const abs = isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv);
    return existsSync(abs) ? dirname(abs) : null;
  }
  const configPath = findConfigFile(cwd);
  return configPath ? dirname(configPath) : null;
}
