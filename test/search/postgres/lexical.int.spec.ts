import { afterAll, beforeAll, expect, it } from 'vitest';

import { createSearchDatabase, describePostgres, driver, type SearchDatabase } from './fixture.js';
import { articles, articlesSlug, guides, guidesSlug, localization } from './shared.js';

describePostgres(`postgres lexical search [${driver}]`, () => {
  let database: SearchDatabase;
  let frogbot: Awaited<ReturnType<SearchDatabase['boot']>>['frogbot'];

  const search = (options: Omit<Parameters<typeof frogbot.search>[0], 'collection' | 'index'>) =>
    frogbot.search({
      collection: articlesSlug,
      index: 'content',
      overrideAccess: true,
      ...options,
    });

  const titles = (result: Awaited<ReturnType<typeof search>>) =>
    result.hits.map(({ doc }) => (doc as { title?: string }).title);

  beforeAll(async () => {
    database = await createSearchDatabase();
    ({ frogbot } = await database.boot({ collections: [articles, guides], localization }));

    const records = [
      { title: 'Frog frog frog', body: 'A frog chorus', tenant: 'a', category: 'pond' },
      { title: 'Frog habitats', body: 'Where they live', tenant: 'a', category: 'pond' },
      { title: 'Jumping', body: 'Frogs jump far', tenant: 'b', category: 'motion' },
      { title: 'Toads', body: 'Not quite frogs', tenant: 'b', category: 'pond' },
      { title: 'Newts', body: 'Salamanders and newts', tenant: 'a', category: 'pond' },
    ];

    for (const data of records) {
      await frogbot.create({
        collection: articlesSlug,
        data: { ...data, _status: 'published' },
        overrideAccess: true,
      });
    }
  });

  afterAll(async () => {
    await database?.shutdown();
  });

  it('ranks matches with full-text relevance, including records without vectors', async () => {
    const result = await search({ query: { text: 'frog' } });

    expect(result.mode).toBe('lexical');
    expect(result.ranking).toEqual({
      method: 'postgres-fts',
      higherIsBetter: true,
      approximate: false,
    });

    expect(titles(result)[0]).toBe('Frog frog frog');
    expect(titles(result)).toHaveLength(4);
    expect(titles(result)).not.toContain('Newts');

    const scores = result.hits.map(({ score }) => score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('uses the configured text search language for stemming', async () => {
    const result = await search({ query: { text: 'jumps' } });

    expect(titles(result)).toEqual(['Jumping']);
  });

  it('supports web search syntax for phrases and exclusions', async () => {
    expect(titles(await search({ query: { text: '"frog chorus"' } }))).toEqual(['Frog frog frog']);

    const excluded = titles(await search({ query: { text: 'frog -toads' } }));

    expect(excluded).not.toContain('Toads');
    expect(excluded).toContain('Frog habitats');
  });

  it('binds query text instead of interpolating it', async () => {
    const result = await search({ query: { text: `'); drop table articles; --` } });

    expect(result.hits).toEqual([]);

    const { rows } = await database.client.query(`select count(*)::int as count from articles`);

    expect(rows[0]).toEqual({ count: 5 });
  });

  it('applies where filters and limits inside the ranked query', async () => {
    const filtered = await search({
      query: { text: 'frog' },
      where: { category: { equals: 'motion' } },
    });

    expect(titles(filtered)).toEqual(['Jumping']);

    const limited = await search({ query: { text: 'frog' }, limit: 1 });

    expect(titles(limited)).toEqual(['Frog frog frog']);
  });

  it('ranks inside the caller access predicate', async () => {
    const req = await frogbot.createRequest();

    req.context.searchTenant = 'b';

    const result = await frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'frog' },
      limit: 1,
      overrideAccess: false,
      req,
    });

    expect(titles(result)).toHaveLength(1);
    expect(['Jumping', 'Toads']).toContain(titles(result)[0]);
  });

  it('rejects filters outside the index filter fields', async () => {
    await expect(
      search({ query: { text: 'frog' }, where: { body: { equals: 'Where they live' } } }),
    ).rejects.toMatchObject({ name: 'SearchFilterUnsupportedError', status: 400 });
  });

  it('searches the latest draft only when draft is requested', async () => {
    const created = await frogbot.create({
      collection: articlesSlug,
      data: { title: 'Published heron', tenant: 'a', _status: 'published' },
      overrideAccess: true,
    });

    await frogbot.update({
      collection: articlesSlug,
      id: created.id,
      data: { title: 'Drafted egret' },
      draft: true,
      overrideAccess: true,
    });

    expect(titles(await search({ query: { text: 'heron' } }))).toEqual(['Published heron']);
    expect(titles(await search({ query: { text: 'egret' } }))).toEqual([]);
    expect(titles(await search({ query: { text: 'egret' }, draft: true }))).toEqual([
      'Drafted egret',
    ]);
    expect(titles(await search({ query: { text: 'heron' }, draft: true }))).toEqual([]);
  });

  it('ranks localized fields in the requested locale', async () => {
    const guide = await frogbot.create({
      collection: guidesSlug,
      data: { title: 'Welcome', summary: 'Shared summary' },
      locale: 'en',
      overrideAccess: true,
    });

    await frogbot.update({
      collection: guidesSlug,
      id: guide.id,
      data: { title: 'Bienvenida' },
      locale: 'es',
      overrideAccess: true,
    });

    const searchGuides = (text: string, locale: 'en' | 'es') =>
      frogbot.search({
        collection: guidesSlug,
        index: 'guides',
        query: { text },
        locale,
        overrideAccess: true,
      });

    expect((await searchGuides('bienvenida', 'es')).hits).toHaveLength(1);
    expect((await searchGuides('bienvenida', 'en')).hits).toHaveLength(0);
    expect((await searchGuides('welcome', 'en')).hits).toHaveLength(1);
    expect((await searchGuides('shared', 'es')).hits).toHaveLength(1);

    const filterGuides = (title: string) =>
      frogbot.search({
        collection: guidesSlug,
        index: 'guides',
        query: { text: 'shared' },
        where: { title: { equals: title } },
        locale: 'es',
        overrideAccess: true,
      });

    expect((await filterGuides('Bienvenida')).hits).toHaveLength(1);
    expect((await filterGuides('Welcome')).hits).toHaveLength(0);
  });

  it('returns an empty result when nothing matches', async () => {
    expect((await search({ query: { text: 'axolotl' } })).hits).toEqual([]);
  });
});
