import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const ENV_FILE = /^\.env(\..+)?$/;
const PUBLIC = 'NEXT_PUBLIC_';
const REFERENCE = /\$\{?([A-Za-z_]\w*)/g;
const PRECEDENCE = ['.env.production.local', '.env.local', '.env.production', '.env'];

/**
 * What a build bakes in from an app's root `.env*` files: each `NEXT_PUBLIC_*` entry, keyed by
 * `<file> <key>`, and each variable those values reference with `$NAME`, keyed by `$ <name>`.
 */
export type PublicEnv = Map<string, string>;

/** Whether every changed path (app-relative, `/`-separated) is a root `.env*` file. */
export function isEnvOnly(paths: string[]): boolean {
  return paths.length > 0 && paths.every((path) => ENV_FILE.test(path));
}

/**
 * Reads what a build bakes in from the root `.env*` files in `dir`; a file it can't read adds none.
 * A referenced variable resolves as Next does: `env` first, then the files by precedence.
 */
export function readPublicEnv(dir: string, env: NodeJS.Dict<string> = {}): PublicEnv {
  const values: PublicEnv = new Map();
  const files = new Map<string, NodeJS.Dict<string>>();
  let names: string[];

  try {
    names = readdirSync(dir)
      .filter((name) => ENV_FILE.test(name))
      .sort();
  } catch {
    return values;
  }

  for (const name of names) {
    try {
      files.set(name, parseEnv(readFileSync(join(dir, name), 'utf8')));
    } catch {}
  }

  const lookup = (key: string) =>
    env[key] ??
    PRECEDENCE.map((name) => files.get(name)?.[key]).find((value) => value !== undefined);

  const pending: string[] = [];

  for (const [name, parsed] of files) {
    for (const [key, value = ''] of Object.entries(parsed)) {
      if (!key.startsWith(PUBLIC)) continue;

      values.set(`${name} ${key}`, value);
      pending.push(value);
    }
  }

  for (let value = pending.pop(); value !== undefined; value = pending.pop()) {
    for (const [, key] of value.matchAll(REFERENCE)) {
      if (values.has(`$ ${key}`)) continue;

      const resolved = lookup(key) ?? '';

      values.set(`$ ${key}`, resolved);
      pending.push(resolved);
    }
  }

  return values;
}

/** The keys added, removed or changed between two reads, each named once. */
export function publicEnvChanged(before: PublicEnv, after: PublicEnv): string[] {
  const keys = new Set<string>();

  for (const [entry, value] of after) if (before.get(entry) !== value) keys.add(keyOf(entry));

  for (const entry of before.keys()) if (!after.has(entry)) keys.add(keyOf(entry));

  return [...keys].sort();
}

const keyOf = (entry: string) => entry.slice(entry.indexOf(' ') + 1);
