import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  rewriteMigrationFile,
  toFrogBotMigration,
} from '../../../../packages/frogbot/src/bin/migrationFile.js';

const drizzle = (
  packageName: string,
) => `import { MigrateUpArgs, MigrateDownArgs, sql } from '${packageName}'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql\`CREATE TABLE \\\`payload_kv\\\` (\\\`id\\\` integer PRIMARY KEY NOT NULL);\`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql\`DROP TABLE \\\`payload_kv\\\`;\`)
}
`;

const mongo = `import {
  MigrateDownArgs,
  MigrateUpArgs,
} from '@payloadcms/db-mongodb'

export async function up({ payload, req, session }: MigrateUpArgs): Promise<void> {
  // Migration code
}

export async function down({ payload, req, session }: MigrateDownArgs): Promise<void> {
  // Migration code
}
`;

describe('toFrogBotMigration', () => {
  it('drops payload from a SQL migration and keeps its statements', () => {
    const source = toFrogBotMigration(drizzle('@frogbotai/db-sqlite'));

    expect(source).toContain('export async function up({ db, req }: MigrateUpArgs)');
    expect(source).toContain('export async function down({ db, req }: MigrateDownArgs)');
    expect(source).toContain("from '@frogbotai/db-sqlite'");
    expect(source).toContain('CREATE TABLE \\`payload_kv\\`');
    expect(source).not.toMatch(/\bpayload\b/);
  });

  it.each(['db-postgres', 'db-vercel-postgres', 'db-d1-sqlite'])(
    'imports %s from @frogbotai',
    (adapter) => {
      expect(toFrogBotMigration(drizzle(`@payloadcms/${adapter}`))).toContain(
        `import { MigrateUpArgs, MigrateDownArgs, sql } from '@frogbotai/${adapter}'`,
      );
    },
  );

  it('gives a MongoDB migration { req, session } from @frogbotai/db-mongodb', () => {
    const source = toFrogBotMigration(mongo);

    expect(source).toContain('export async function up({ req, session }: MigrateUpArgs)');
    expect(source).toContain('export async function down({ req, session }: MigrateDownArgs)');
    expect(source).toContain("} from '@frogbotai/db-mongodb'");
    expect(source).not.toMatch(/payload/);
  });

  it('leaves a migration already in FrogBot shape unchanged', () => {
    const source = toFrogBotMigration(drizzle('@frogbotai/db-sqlite'));

    expect(toFrogBotMigration(source)).toBe(source);
  });
});

describe('rewriteMigrationFile', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { force: true, recursive: true });

    directory = undefined;
  });

  it('rewrites the generated file in place', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'frogbot-migration-'));
    const file = path.join(directory, '20260101_000000_init.ts');

    await writeFile(file, drizzle('@frogbotai/db-sqlite'));
    await rewriteMigrationFile(file);

    expect(await readFile(file, 'utf8')).toBe(toFrogBotMigration(drizzle('@frogbotai/db-sqlite')));
  });
});
