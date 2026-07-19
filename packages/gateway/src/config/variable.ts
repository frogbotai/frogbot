import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { ConfigError } from '../errors/gatewayError.js';

type InterpolateConfigTextOptions = {
  text: string;
  source: string;
  dir?: string;
  env?: NodeJS.ProcessEnv;
};

const ENV_TOKEN = /(\\*)(\{env:([^}]*)\})/g;
const FILE_TOKEN = /(\\*)(\{file:([^}]*)\})/g;

export async function interpolateConfigText(options: InterpolateConfigTextOptions): Promise<string> {
  const dir = options.dir ?? dirname(options.source);
  const env = options.env ?? process.env;

  const withEnv = options.text.replace(ENV_TOKEN, (_m, slashes: string, token: string, name: string) => {
    const prefix = '\\'.repeat(Math.floor(slashes.length / 2));
    if (slashes.length % 2 === 1) return prefix + token;
    const value = env[name];
    if (value === undefined) {
      throw new ConfigError([`failed to resolve ${token} in ${options.source}: environment variable ${name} is not set`]);
    }
    return prefix + JSON.stringify(value).slice(1, -1);
  });

  const matches = [...withEnv.matchAll(FILE_TOKEN)];
  if (matches.length === 0) return withEnv;

  let out = '';
  let cursor = 0;
  for (const match of matches) {
    const full = match[0];
    const slashes = match[1] ?? '';
    const token = match[2] ?? '';
    const filePath = match[3] ?? '';
    const index = match.index ?? 0;
    out += withEnv.slice(cursor, index);
    cursor = index + full.length;

    const prefix = '\\'.repeat(Math.floor(slashes.length / 2));
    if (slashes.length % 2 === 1) {
      out += prefix + token;
      continue;
    }

    const resolved = await resolveConfigFilePath({ filePath, dir, token, source: options.source });
    try {
      out += prefix + JSON.stringify((await readFile(resolved, 'utf8')).trim()).slice(1, -1);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new ConfigError([`failed to resolve ${token} in ${options.source}: ${cause}`]);
    }
  }

  out += withEnv.slice(cursor);
  return out;
}

type ResolveConfigFilePathOptions = {
  filePath: string;
  dir: string;
  token: string;
  source: string;
};

async function resolveConfigFilePath(options: ResolveConfigFilePathOptions): Promise<string> {
  const { filePath, dir, token, source } = options;
  if (filePath.length === 0) {
    throw new ConfigError([`failed to resolve ${token} in ${source}: empty file path`]);
  }

  const expanded = filePath.startsWith('~/') ? join(homedir(), filePath.slice(2)) : filePath;
  const lexical = isAbsolute(expanded) ? resolve(expanded) : resolve(dir, expanded);
  const base = resolve(dir);

  if (!isInside(base, lexical)) {
    throw new ConfigError([`failed to resolve ${token} in ${source}: path resolves outside the config directory`]);
  }

  const canonicalBase = await realpathOrSelf(base);
  const canonical = await realpathOrSelf(lexical);
  if (!isInside(canonicalBase, canonical)) {
    throw new ConfigError([`failed to resolve ${token} in ${source}: path resolves outside the config directory`]);
  }

  return canonical;
}

/** True when `target` is `base` itself or nested under it, avoiding the `startsWith` prefix bug. */
function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Canonicalize `p` with `realpath` to defeat symlink escapes. If `p` (or an
 * ancestor) does not exist yet, `realpath` throws ENOENT — fall back to the
 * deepest existing ancestor's canonical path joined with the remaining
 * lexical tail, so a non-existent path is still checked against the base
 * without leaking existence.
 */
async function realpathOrSelf(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    const parent = dirname(p);
    if (parent === p) return p;
    const canonicalParent = await realpathOrSelf(parent);
    return join(canonicalParent, p.slice(parent.length + 1));
  }
}
