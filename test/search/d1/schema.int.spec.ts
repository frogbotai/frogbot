import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import {
  type BootedSearch,
  createSearchDatabase,
  describeD1,
  type SearchDatabase,
} from './fixture.js';
import { articlesSlug } from './shared.js';

const fts = 'frogbot_search_search_articles_content_fts';

type PushResult = {
  apply: () => Promise<void>;
  statementsToExecute: string[];
};

describeD1('D1 search schema push', () => {
  let database: SearchDatabase;
  let booted: BootedSearch;

  const push = async () => {
    const { db } = booted.payload;

    const result = (await db
      .requireDrizzleKit()
      .pushSchema(db.schema, db.drizzle as never)) as PushResult;

    await result.apply();

    return result;
  };

  const searchIDs = async (frogbot = booted.frogbot) =>
    (
      await frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { text: 'durable' },
        overrideAccess: true,
      })
    ).hits.map(({ doc }) => doc.id);

  beforeAll(async () => {
    database = await createSearchDatabase();
    booted = await database.boot();
  });

  afterAll(async () => {
    await database.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('creates FTS5 tables and triggers without vector objects', async () => {
    const objects = await database.objects();
    const names = objects.map(({ name }) => name);

    expect(names).toContain(fts);
    expect(names).toContain('frogbot_search_search_articles_content_insert');
    expect(names).toContain('frogbot_search__search_articles_v_content_fts');
    expect(names).toContain('frogbot_search_search_notes_content_keys');
    expect(names.some((name) => name.includes('_vectors'))).toBe(false);
    expect(objects.some(({ sql }) => /vector32|libsql_vector_idx|F32_BLOB/.test(sql ?? ''))).toBe(
      false,
    );
  });

  it('leaves current search objects untouched on repeated pushes', async () => {
    const before = await database.objects();
    const result = await push();

    expect(result.statementsToExecute).toEqual([]);
    expect(await database.objects()).toEqual(before);
  });

  it('reports a readiness error for a dropped index and rebuilds it from stored records', async () => {
    const created = await booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', title: 'Durable keyword' },
      overrideAccess: true,
    } as never);

    await database.binding.prepare(`DROP TABLE "${fts}"`).run();

    await expect(searchIDs()).rejects.toMatchObject({ name: 'SearchReadinessError', status: 503 });

    await push();

    expect(await searchIDs()).toEqual([created.id]);
  });

  it('boots again on a populated database and keeps ranking stored records', async () => {
    const created = await booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', title: 'Durable restart' },
      overrideAccess: true,
    } as never);

    const before = await database.objects();
    const restarted = await database.boot();

    expect(await database.objects()).toEqual(before);
    expect(await searchIDs(restarted.frogbot)).toEqual([created.id]);
  });
});
