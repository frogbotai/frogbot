import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { sql } from '@frogbotai/db-sqlite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { articlesSlug, databasePath } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fts = 'frogbot_search_search_articles_content_fts';

describe('SQLite search schema push', () => {
  let booted: BootedFrogBot;
  let db: SQLiteAdapter;

  const objects = async () =>
    db.drizzle.all<{ name: string; sql: string; type: string }>(
      sql`SELECT "type", "name", "sql" FROM sqlite_master WHERE "name" GLOB 'frogbot_search_*' ORDER BY "name"`,
    );

  const push = async () => {
    const result = (await db.requireDrizzleKit().pushSchema(db.schema, db.drizzle as never)) as {
      apply: () => Promise<void>;
      hasDataLoss: boolean;
      statementsToExecute: string[];
      warnings: string[];
    };

    await result.apply();

    return result;
  };

  const indexed = async (text: string) =>
    db.drizzle.all<{ rowid: number }>(
      sql`SELECT rowid FROM ${sql.identifier(fts)} WHERE ${sql.identifier(fts)} MATCH ${text}`,
    );

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'search-sqlite-schema');
    db = booted.payload.db as unknown as SQLiteAdapter;
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('leaves current search objects untouched on repeated pushes', async () => {
    const before = await objects();

    await db.drizzle.run(
      sql`INSERT INTO ${sql.identifier(fts)} (rowid, "title", "body") VALUES (999999, 'sentinel', '')`,
    );

    const result = await push();

    expect(result.statementsToExecute).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.hasDataLoss).toBe(false);
    expect(await objects()).toEqual(before);
    expect(await indexed('sentinel')).toEqual([{ rowid: 999999 }]);

    await db.drizzle.run(sql`DELETE FROM ${sql.identifier(fts)} WHERE rowid = 999999`);
  });

  it('rebuilds drifted search objects and repopulates them from stored records', async () => {
    const before = await objects();
    const created = (await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'Rebuilt keyword', _status: 'published' },
      overrideAccess: true,
    } as never)) as { id: number };

    await db.drizzle.run(sql`DROP TRIGGER "frogbot_search_search_articles_content_update"`);
    await db.drizzle.run(sql`DELETE FROM ${sql.identifier(fts)}`);
    await db.drizzle.run(sql`CREATE VIRTUAL TABLE "frogbot_search_stale_fts" USING fts5("value")`);
    await db.drizzle.run(sql`INSERT INTO "frogbot_search_stale_fts" ("value") VALUES ('stale')`);

    const result = await push();

    expect(result.statementsToExecute).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.hasDataLoss).toBe(false);
    expect(await objects()).toEqual(before);
    expect(await indexed('rebuilt')).toEqual([{ rowid: created.id }]);
  });

  it('reports a readiness error when a search index is not built', async () => {
    await db.drizzle.run(sql`DROP TABLE ${sql.identifier(fts)}`);

    await expect(
      booted.frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { text: 'anything' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ name: 'SearchReadinessError', status: 503 });

    const vector = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { vector: [1, 0, 0] },
      overrideAccess: true,
    });

    expect(vector.hits).toEqual([]);

    await push();

    const lexical = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'anything' },
      overrideAccess: true,
    });

    expect(lexical.hits).toEqual([]);
  });

  it('drops search objects with the database', async () => {
    await db.dropDatabase({ adapter: db });

    expect(await objects()).toEqual([]);

    await push();

    expect((await objects()).length).toBeGreaterThan(0);
  });
});
