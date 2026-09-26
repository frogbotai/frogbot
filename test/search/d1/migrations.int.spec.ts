import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { CollectionConfig } from 'frogbot';
import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  type BootedSearch,
  createSearchDatabase,
  describeD1,
  type SearchDatabase,
} from './fixture.js';
import { Articles, articlesSlug, collections } from './shared.js';

const getMigrationDir = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

async function readMigration(migrationDir: string, name: string) {
  const file = (await readdir(migrationDir)).find((entry) => entry.endsWith(`_${name}.ts`));

  return readFile(`${migrationDir}/${file}`, 'utf8');
}

async function createMigration({ payload }: BootedSearch, migrationName: string) {
  await payload.db.createMigration({ forceAcceptWarning: true, migrationName, payload });
}

async function migrate({ payload }: BootedSearch, migrationDir: string) {
  for (const file of await readdir(migrationDir)) {
    if (!/^\d.*\.ts$/.test(file)) continue;

    const source = await readFile(`${migrationDir}/${file}`, 'utf8');

    await writeFile(
      `${migrationDir}/${file}`,
      source.replace(
        /import \{([^}]*)\} from '@frogbotai\/db-d1-sqlite'/,
        (_, names: string) =>
          `import {${names.replace(/(?<!type )\b(Migrate(?:Down|Up)Args)\b/g, 'type $1')}} from '@frogbotai/db-d1-sqlite'`,
      ),
    );
  }

  await payload.db.migrate();
}

async function searchIDs({ frogbot }: BootedSearch, text: string) {
  const result = await frogbot.search({
    collection: articlesSlug,
    index: 'content',
    query: { text },
    overrideAccess: true,
  });

  return result.hits.map(({ doc }) => doc.id);
}

describeD1('D1 search migrations', () => {
  const migrationDir = getMigrationDir('migrations');

  let database: SearchDatabase;
  let booted: BootedSearch;

  beforeAll(async () => {
    await rm(migrationDir, { force: true, recursive: true });

    database = await createSearchDatabase();
    booted = await database.boot({ migrationDir, push: false });
  });

  afterAll(async () => {
    await database.shutdown();
    await rm(migrationDir, { force: true, recursive: true });
  });

  it('generates and applies search objects with the schema migration', async () => {
    expect(await database.objects()).toEqual([]);

    await createMigration(booted, 'initial');

    const migration = await readMigration(migrationDir, 'initial');

    expect(migration).toContain("from '@frogbotai/db-d1-sqlite'");
    expect(migration).toContain(
      'CREATE VIRTUAL TABLE "frogbot_search_search_articles_content_fts"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "frogbot_search_search_pages_content_locales_insert"',
    );
    expect(migration).not.toMatch(/vector32|libsql_vector_idx|F32_BLOB/);

    await migrate(booted, migrationDir);

    const created = (await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'Migrated keyword', _status: 'published' },
      overrideAccess: true,
    } as never)) as { id: number };

    expect(await searchIDs(booted, 'migrated')).toEqual([created.id]);
  });

  it('generates an empty migration when nothing changed and applies it repeatedly', async () => {
    const before = await database.objects();

    await createMigration(booted, 'unchanged');

    expect(await readMigration(migrationDir, 'unchanged')).not.toContain('db.run');

    await migrate(booted, migrationDir);
    await migrate(booted, migrationDir);

    expect(await database.objects()).toEqual(before);
    expect(await searchIDs(booted, 'migrated')).toHaveLength(1);
  });
});

describeD1('D1 search migrations on a populated database', () => {
  const migrationDir = getMigrationDir('migrations-populated');

  const unindexed: CollectionConfig[] = collections.map((collection) =>
    collection.slug === articlesSlug ? { ...Articles, search: undefined } : collection,
  );

  let database: SearchDatabase;

  beforeAll(async () => {
    await rm(migrationDir, { force: true, recursive: true });

    database = await createSearchDatabase();
  });

  afterAll(async () => {
    await database.shutdown();
    await rm(migrationDir, { force: true, recursive: true });
  });

  it('indexes existing records when a migration adds a search index and removes it on the way down', async () => {
    const before = await database.boot({ collections: unindexed, migrationDir, push: false });

    await createMigration(before, 'base');
    await migrate(before, migrationDir);

    const existing = (await before.frogbot.create({
      collection: articlesSlug,
      data: { title: 'Existing keyword', _status: 'published' },
      overrideAccess: true,
    } as never)) as { id: number };

    const after = await database.boot({ migrationDir, push: false });

    await createMigration(after, 'search');
    await migrate(after, migrationDir);

    expect(await searchIDs(after, 'existing')).toEqual([existing.id]);

    await after.payload.db.migrateDown();

    expect((await database.objects()).some(({ name }) => name.includes('search_articles'))).toBe(
      false,
    );
  });
});
