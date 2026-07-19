import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, parse, resolve } from 'node:path';

import { ConfigError } from '../errors/gatewayError.js';
import { loadConfigFile, mergeConfigs, isRecord } from './parse.js';
import type { GatewayConfig } from './schema.js';
import { interpolateConfigText } from './variable.js';

const CONFIG_NAMES = [
  'gateway.config.ts',
  'gateway.config.mts',
  'gateway.config.cts',
  'gateway.config.js',
  'gateway.config.mjs',
  'gateway.config.cjs',
  'gateway.config.json',
];

const GLOBAL_CONFIG_NAMES = [
  'gateway.ts',
  'gateway.mts',
  'gateway.cts',
  'gateway.js',
  'gateway.mjs',
  'gateway.cjs',
  'gateway.json',
  ...CONFIG_NAMES,
];

export type ConfigSource = {
  path?: string;
  kind: 'defaults' | 'global' | 'env' | 'project' | 'inline';
};

export type LayeredConfigOptions = {
  defaults?: GatewayConfig;
  configPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type LayeredConfigResult = {
  config: GatewayConfig;
  sources: ConfigSource[];
};

export async function loadLayeredConfig(options: LayeredConfigOptions = {}): Promise<LayeredConfigResult> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const sources: ConfigSource[] = [];
  let config = options.defaults ?? { providers: {} };
  sources.push({ kind: 'defaults' });

  for (const path of await existingGlobalConfigPaths(env)) {
    config = mergeConfigs(config, await loadConfigFile(path));
    sources.push({ kind: 'global', path });
  }

  for (const path of await projectConfigPaths(cwd, env)) {
    config = mergeConfigs(config, await loadConfigFile(path));
    sources.push({ kind: 'project', path });
  }

  const explicitPath = options.configPath ?? env.GATEWAY_CONFIG;
  if (explicitPath) {
    const path = resolve(cwd, explicitPath);
    config = mergeConfigs(config, await loadConfigFile(path));
    sources.push({ kind: 'env', path });
  }

  if (env.GATEWAY_CONFIG_JSON) {
    const text = await interpolateConfigText({
      text: env.GATEWAY_CONFIG_JSON,
      source: 'GATEWAY_CONFIG_JSON',
      dir: cwd,
      env,
    });
    let parsed: GatewayConfig;
    try {
      parsed = JSON.parse(text) as GatewayConfig;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ConfigError([`GATEWAY_CONFIG_JSON: invalid JSON — ${msg}`]);
    }
    if (!isRecord(parsed)) {
      throw new ConfigError([
        `GATEWAY_CONFIG_JSON: expected a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
      ]);
    }
    config = mergeConfigs(config, parsed);
    sources.push({ kind: 'inline' });
  }

  return { config, sources };
}

async function existingGlobalConfigPaths(env: NodeJS.ProcessEnv): Promise<string[]> {
  const base = env.XDG_CONFIG_HOME ? env.XDG_CONFIG_HOME : resolve(homedir(), '.config');
  const dir = resolve(base, 'frogbotai');
  const paths = GLOBAL_CONFIG_NAMES.map((name) => resolve(dir, name));
  return existing(paths);
}

async function projectConfigPaths(cwd: string, env: NodeJS.ProcessEnv): Promise<string[]> {
  const out: string[] = [];
  let dir = resolve(cwd);
  const boundary = findProjectRoot(dir, env);
  for (let i = 0; i < 64; i++) {
    const [first] = await existing(CONFIG_NAMES.map((name) => resolve(dir, name)));
    if (first) {
      out.push(first);
    }
    if (dir === boundary) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) {
      break;
    }
    dir = parent;
  }
  return out.reverse();
}

// Bounds the project config walk so it never traverses past the project root
// into untrusted ancestor directories (a stray `gateway.config.ts` there would
// otherwise be dynamically imported and executed). The boundary is an explicit
// GATEWAY_CONFIG_ROOT override, else the nearest ancestor holding a `.git` or
// `package.json`. With no marker found, discovery is confined to `cwd`.
function findProjectRoot(start: string, env: NodeJS.ProcessEnv): string {
  const override = env.GATEWAY_CONFIG_ROOT;
  if (override) {
    return resolve(override);
  }
  let dir = start;
  for (let i = 0; i < 64; i++) {
    if (existsSync(resolve(dir, '.git')) || existsSync(resolve(dir, 'package.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) {
      break;
    }
    dir = parent;
  }
  return start;
}

async function existing(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths) {
    try {
      await access(path);
      out.push(path);
    } catch {
      // Not readable / doesn't exist — skip it.
    }
  }
  return out;
}
