import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { sql } from '@frogbotai/db-sqlite';
import type { FrogBotInstance } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { articlesSlug, buildSearchConfig, pagesSlug } from './shared.js';

const databasePath = fileURLToPath(new URL('./search-migrations.db', import.meta.url));
const migrationDir = fileURLToPath(new URL('./migrations', import.meta.url));

type Snapshot = Record<string, unknown> & {
  frogbot?: { search?: Record<string, unknown> };
  tables: Record<string, { columns: Record<string, unknown> }>;
};

describe('SQLite search migrations', () => {
  let frogbot: FrogBotInstance;
  let payload: Payload;
  let db: SQLiteAdapter;

  const objects = async () =>
    db.drizzle.all<{ name: string; sql: string }>(
      sql`SELECT "name", "sql" FROM sqlite_master WHERE "name" GLOB 'frogbot_search_*' ORDER BY "name"`,
    );

  const run = async (statements: string[]) => {
    for (const statement of statements) await db.drizzle.run(sql.raw(statement));
  };

  const migrate = async () => {
    for (const file of await readdir(migrationDir)) {
      if (!/^\d.*\.ts$/.test(file)) continue;

      const source = await readFile(`${migrationDir}/${file}`, 'utf8');

      await writeFile(
        `${migrationDir}/${file}`,
        source.replace(
          /import \{([^}]*)\} from '@frogbotai\/db-sqlite'/,
          (_, names: string) =>
            `import {${names.replace(/(?<!type )\b(Migrate(?:Down|Up)Args)\b/g, 'type $1')}} from '@frogbotai/db-sqlite'`,
        ),
      );
    }

    await db.migrate();
  };

  const searchIDs = async (text: string) =>
    (
      await frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { text },
        overrideAccess: true,
      })
    ).hits.map(({ doc }) => doc.id);

  beforeAll(async () => {
    await rm(migrationDir, { force: true, recursive: true });

    frogbot = await new FrogBot().init({
      config: await buildSearchConfig({ migrationDir, push: false, url: `file:${databasePath}` }),
    });

    payload = (frogbot as unknown as { payload: Payload }).payload;
    db = payload.db as unknown as SQLiteAdapter;
  });

  afterAll(async () => {
    await frogbot.destroy();
    await rm(databasePath, { force: true });
    await rm(migrationDir, { force: true, recursive: true });
  });

  it('generates and applies search objects with the schema migration', async () => {
    expect(await objects()).toEqual([]);

    await db.createMigration({ forceAcceptWarning: true, migrationName: 'initial', payload });

    const files = (await readdir(migrationDir)).filter((file) => file.endsWith('_initial.ts'));
    const migration = await readFile(`${migrationDir}/${files[0]}`, 'utf8');
    const snapshot = JSON.parse(
      await readFile(`${migrationDir}/${files[0].replace(/\.ts$/, '.json')}`, 'utf8'),
    ) as Snapshot;

    expect(migration).toContain(
      'CREATE VIRTUAL TABLE "frogbot_search_search_articles_content_fts"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "frogbot_search_search_pages_content_locales_insert"',
    );
    expect(migration).toContain(
      'DROP TRIGGER IF EXISTS "frogbot_search_search_articles_content_insert"',
    );
    expect(Object.keys(snapshot.frogbot?.search ?? {})).toContain(
      'frogbot_search_search_articles_content',
    );

    await migrate();

    expect((await objects()).length).toBeGreaterThan(0);

    const created = (await frogbot.create({
      collection: articlesSlug,
      data: { title: 'Migrated keyword', _status: 'published' },
      overrideAccess: true,
    } as never)) as { id: number };

    expect(await searchIDs('migrated')).toEqual([created.id]);
  });

  it('generates an empty migration when nothing changed', async () => {
    await db.createMigration({ forceAcceptWarning: true, migrationName: 'unchanged', payload });

    const file = (await readdir(migrationDir)).find((name) => name.endsWith('_unchanged.ts'));
    const migration = await readFile(`${migrationDir}/${file}`, 'utf8');

    expect(migration).not.toContain('db.run');

    await migrate();

    expect(await searchIDs('migrated')).toHaveLength(1);
  });

  it('adds search objects to a populated database and removes them on the way down', async () => {
    const kit = db.requireDrizzleKit();
    const current = (await kit.generateDrizzleJson(db.schema)) as Snapshot;
    const { frogbot: _search, ...base } = current;

    const down = await kit.generateMigration(current as never, base as never);

    expect(down.every((statement) => statement.startsWith('DROP '))).toBe(true);

    await run(down);

    expect(await objects()).toEqual([]);

    await frogbot.create({
      collection: pagesSlug,
      data: { title: 'Existing page', summary: 'Shared summary' },
      locale: 'en',
      overrideAccess: true,
    } as never);

    await expect(searchIDs('migrated')).rejects.toMatchObject({ name: 'SearchReadinessError' });

    await run(await kit.generateMigration(base as never, current as never));

    expect(await searchIDs('migrated')).toHaveLength(1);

    const pages = await frogbot.search({
      collection: pagesSlug,
      index: 'content',
      query: { text: 'existing shared' },
      locale: 'en',
      overrideAccess: true,
    } as never);

    expect(pages.hits).toHaveLength(1);
    expect(await kit.generateMigration(current as never, current as never)).toEqual([]);
  });

  it('rebuilds only the search objects of tables the schema migration changes', async () => {
    const kit = db.requireDrizzleKit();
    const current = (await kit.generateDrizzleJson(db.schema)) as Snapshot;
    const previous = structuredClone(current);

    delete previous.tables.search_articles.columns.rating;

    const statements = await kit.generateMigration(previous as never, current as never);
    const alter = statements.findIndex((statement) => statement.includes('`search_articles`'));
    const drops = statements.slice(0, alter);
    const creates = statements.slice(alter + 1);

    expect(alter).toBeGreaterThan(0);
    expect(drops).toContain(
      'DROP TRIGGER IF EXISTS "frogbot_search_search_articles_content_insert"',
    );
    expect(drops.some((statement) => statement.includes('search_pages'))).toBe(false);
    expect(
      creates.some((statement) =>
        statement.startsWith('INSERT INTO "frogbot_search_search_articles_content_fts"'),
      ),
    ).toBe(true);
    expect(creates.some((statement) => statement.includes('search_pages'))).toBe(false);
  });

  it('rebuilds a search index whose definition changed', async () => {
    const kit = db.requireDrizzleKit();
    const current = (await kit.generateDrizzleJson(db.schema)) as Snapshot;
    const previous = structuredClone(current);
    const group = 'frogbot_search_search_pages_content';
    const search = previous.frogbot?.search as Record<string, { objects: { sql: string }[] }>;

    search[group].objects[0].sql = search[group].objects[0].sql.replace(', "summary"', '');

    const statements = await kit.generateMigration(previous as never, current as never);

    expect(statements[0]).toBe(
      'DROP TRIGGER IF EXISTS "frogbot_search_search_pages_content_update"',
    );
    expect(statements).toContain('DROP TABLE IF EXISTS "frogbot_search_search_pages_content_fts"');
    expect(statements).toContain('DROP TABLE IF EXISTS "frogbot_search_search_pages_content_vectors"');
    expect(statements.slice(-2)).toEqual([
      expect.stringMatching(/^INSERT INTO "frogbot_search_search_pages_content_fts"/),
      expect.stringMatching(/^INSERT INTO "frogbot_search_search_pages_content_vectors"/),
    ]);
    expect(statements.every((statement) => statement.includes('search_pages'))).toBe(true);
  });
});
