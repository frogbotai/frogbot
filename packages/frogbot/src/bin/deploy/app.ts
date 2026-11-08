import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { DeployError } from './error.js';
import { readVariable } from './preflight.js';
import type { DeployContext } from './types.js';

const notBuilt = new Set(['node_modules', '.next', '.git', '.frogbot', 'files', 'dist']);

const runtimeOnly = new Set(['NODE_ENV', 'PORT', 'HOSTNAME']);

/** The app's `package.json` name without its scope, made safe for image, service and app names. */
export function appSlug(root: string): string {
  let name = basename(root);

  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown };

    if (typeof pkg.name === 'string' && pkg.name) name = pkg.name.replace(/^@[^/]+\//, '');
  } catch {
    name = basename(root);
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

  return /^[a-z]/.test(slug) ? slug : `app-${slug || 'frogbot'}`;
}

/** The first 12 hex characters of a hash over the app's source, so an unchanged app gets the same tag. */
export function sourceTag(root: string): string {
  const hash = createHash('sha256');

  const walk = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const entry of entries) {
      const path = join(dir, entry.name);

      if (entry.isDirectory() && !notBuilt.has(entry.name)) walk(path);
      else if (entry.isFile() && !entry.name.startsWith('.env') && !/\.db(-|$)/.test(entry.name)) {
        hash.update(relative(root, path)).update('\0').update(readFileSync(path)).update('\0');
      }
    }
  };

  walk(root);

  return hash.digest('hex').slice(0, 12);
}

/** Parses the target's own flags; an unknown flag or a stray argument is a usage error. */
export function parseTargetArgs<T extends ParseArgsOptionsConfig>(
  context: DeployContext,
  { target, usage, options }: { target: string; usage: string; options: T },
) {
  try {
    return parseArgs({ args: context.args, options, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new DeployError(
      `${(error as Error).message}\nUsage: ${context.io.program} deploy ${target} ${usage}`,
      2,
    );
  }
}

/** Whether the deployed app would use a SQLite file: `DATABASE_URL` empty or `file:`. */
export function usesFileDatabase(context: DeployContext): boolean {
  const url = readVariable(context, 'DATABASE_URL');

  return !url || url.startsWith('file:');
}

/** The app's variables split for a host: `NEXT_PUBLIC_*` go in at build time; the rest are secrets. */
export function splitVariables(context: DeployContext): {
  secrets: Record<string, string>;
  build: Record<string, string>;
} {
  const secrets: Record<string, string> = {};
  const build: Record<string, string> = {};

  for (const [name, value] of Object.entries(context.env)) {
    if (value === '' || runtimeOnly.has(name)) continue;

    if (name.startsWith('NEXT_PUBLIC_')) build[name] = value;
    else secrets[name] = value;
  }

  return { secrets, build };
}

/** `--build-arg NAME=VALUE` for each build-time variable, with a note when the Dockerfile doesn't declare it. */
export function buildArgs(context: DeployContext, build: Record<string, string>): string[] {
  const names = Object.keys(build);

  if (names.length === 0) return [];

  let declared = '';

  try {
    declared = readFileSync(join(context.root, 'Dockerfile'), 'utf8');
  } catch {
    declared = '';
  }

  const missing = names.filter((name) => !new RegExp(`^\\s*ARG\\s+${name}\\b`, 'm').test(declared));

  if (missing.length > 0) {
    context.log(
      `[frogbot] ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} read at build time; add \`ARG ${missing[0]}\` (one per name) to the Dockerfile's builder stage so \`next build\` sees ${missing.length === 1 ? 'it' : 'them'}.`,
    );
  }

  return names.flatMap((name) => ['--build-arg', `${name}=${build[name]}`]);
}
