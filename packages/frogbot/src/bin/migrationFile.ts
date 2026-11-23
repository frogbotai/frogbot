import { readFile, writeFile } from 'node:fs/promises';

const SIGNATURE = /(export async function (?:up|down)\(\{)([^}]*)(\}: Migrate(?:Up|Down)Args\))/g;

const ADAPTER_IMPORT = /from '@payloadcms\/(db-[\w-]+)'/g;

/**
 * Gives a generated migration FrogBot's shape: no `payload` argument, and no `session` (MongoDB's comes from
 * `migrationDatabase(req)`), with types from the `@frogbotai` adapter.
 */
export function toFrogBotMigration(source: string): string {
  return source
    .replace(SIGNATURE, (_, open: string, names: string, close: string) => {
      const kept = names
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name && name !== 'payload' && name !== 'session');

      return `${open} ${kept.join(', ')} ${close}`;
    })
    .replace(ADAPTER_IMPORT, "from '@frogbotai/$1'");
}

/**
 * Refuses Payload's predefined migrations (`--file @payloadcms/...`): their bodies use a `payload` argument
 * that FrogBot migrations don't get. `migrate:create` reads a predefined migration from `--file`, or from
 * the name when there's no `--file`.
 */
export function assertFrogBotPredefined(importPath: string | undefined): void {
  if (!importPath?.startsWith('@payloadcms/')) return;

  throw new Error(
    `migrate:create can't use ${importPath}: it's written for an argument FrogBot migrations don't get. ` +
      'Create the migration without --file and write it with { db, req }.',
  );
}

export async function rewriteMigrationFile(path: string): Promise<void> {
  await writeFile(path, toFrogBotMigration(await readFile(path, 'utf8')));
}
