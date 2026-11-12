import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const ENV_FILE = /^\.env(\..+)?$/;
const PUBLIC = 'NEXT_PUBLIC_';

/** The `NEXT_PUBLIC_*` values of an app's root `.env*` files, keyed by `<file> <key>`. */
export type PublicEnv = Map<string, string>;

/** Whether every changed path (app-relative, `/`-separated) is a root `.env*` file. */
export function isEnvOnly(paths: string[]): boolean {
  return paths.length > 0 && paths.every((path) => ENV_FILE.test(path));
}

/** Reads the `NEXT_PUBLIC_*` entries of each root `.env*` file in `dir`; a file it can't read adds none. */
export function readPublicEnv(dir: string): PublicEnv {
  const values: PublicEnv = new Map();
  let names: string[];

  try {
    names = readdirSync(dir)
      .filter((name) => ENV_FILE.test(name))
      .sort();
  } catch {
    return values;
  }

  for (const name of names) {
    let parsed: NodeJS.Dict<string>;

    try {
      parsed = parseEnv(readFileSync(join(dir, name), 'utf8'));
    } catch {
      continue;
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith(PUBLIC)) values.set(`${name} ${key}`, value ?? '');
    }
  }

  return values;
}

/** The `NEXT_PUBLIC_*` keys added, removed or changed between two reads, each named once. */
export function publicEnvChanged(before: PublicEnv, after: PublicEnv): string[] {
  const keys = new Set<string>();

  for (const [entry, value] of after) if (before.get(entry) !== value) keys.add(keyOf(entry));

  for (const entry of before.keys()) if (!after.has(entry)) keys.add(keyOf(entry));

  return [...keys].sort();
}

const keyOf = (entry: string) => entry.slice(entry.indexOf(' ') + 1);
