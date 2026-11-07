import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { sanitizeToolList } from '../../../../packages/frogbot/src/tools/config/sanitize.js';
import { searchTool } from '../../../../packages/frogbot/src/tools/search.js';
import type { ToolCtx } from '../../../../packages/frogbot/src/tools/types.js';

const lexical = { fields: [{ path: 'title', localized: false }] };
const vector = {
  path: 'embedding',
  localized: false,
  dimensions: 3,
  metric: 'cosine',
  approximate: false,
};

const hybrid = { fusion: 'rrf', weights: { lexical: 1, vector: 1 } };

const indexes = {
  words: { name: 'words', lexical, filterFields: {} },
  meaning: { name: 'meaning', vector, filterFields: {} },
  both: { name: 'both', lexical, vector, hybrid, filterFields: {} },
};

function makeCtx({ overrideAccess = false, useAsTitle = 'title' } = {}) {
  const search = vi.fn().mockResolvedValue({
    mode: 'lexical',
    ranking: { method: 'bm25', higherIsBetter: true, approximate: false },
    hits: [
      {
        doc: { id: 2, title: 'Second' },
        score: 0.9,
        components: { lexical: { rank: 1, score: 0.9 }, vector: null },
      },
      { doc: { id: 1, title: 'First' }, score: 0.4 },
    ],
  });

  const embed = vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
  const find = vi.fn().mockResolvedValue({ docs: [{ id: 3, title: 'Third' }] });
  const frogbot = {
    collections: { posts: { slug: 'posts', auth: false, useAsTitle, search: indexes } },
    search,
    embed,
    find,
  };

  const ctx = {
    req: { frogbot },
    frogbot,
    agent: { slug: 'support', runId: 'run-1' },
    overrideAccess,
  } as unknown as ToolCtx;

  return { ctx, embed, search, find };
}

const base = { collection: 'posts', index: 'words', select: { title: true } } as const;

describe('searchTool', () => {
  it('names, describes and shapes the tool', () => {
    const tool = searchTool(base);

    expect(tool.slug).toBe('search_posts_words');
    expect(tool.description).toContain("'posts'");
    expect(tool.description).toContain("'words'");
    expect(tool.description).toContain('not instructions');
    expect(z.toJSONSchema(tool.inputSchema)).toMatchObject({
      properties: { query: { type: 'string', minLength: 1 } },
      required: ['query'],
      additionalProperties: false,
    });
  });

  it('replaces characters a tool name cannot hold', () => {
    expect(searchTool({ ...base, collection: 'search-posts', index: 'kb.v2' }).slug).toBe(
      'search_search-posts_kb_v2',
    );
  });

  it('takes a slug and description override', () => {
    const tool = searchTool({ ...base, slug: 'find_posts', description: 'Find posts.' });

    expect(tool.slug).toBe('find_posts');
    expect(tool.description).toBe('Find posts.');
  });

  it('refuses an empty query and any input besides query', () => {
    const { inputSchema } = searchTool(base);

    expect(inputSchema.safeParse({ query: '  ' }).success).toBe(false);
    expect(
      inputSchema.safeParse({ query: 'frogs', where: { title: { equals: 'x' } } }).success,
    ).toBe(false);
    expect(inputSchema.safeParse({ query: 'frogs', limit: 50 }).success).toBe(false);
    expect(inputSchema.parse({ query: ' frogs ' })).toEqual({ query: 'frogs' });
  });

  it.each([
    ['collection', { collection: '' }, '`collection` must be a non-empty string'],
    ['index', { index: 3 }, '`index` must be a non-empty string'],
    ['missing select', { select: undefined }, '`select` must list at least one field'],
    ['empty select', { select: {} }, '`select` must list at least one field'],
    ['score in select', { select: { title: true, score: true } }, "`select` can't include `score`"],
    ['model', { model: ' ' }, '`model` must be a non-empty string'],
    ['where', { where: [] }, '`where` must be an object'],
    ['zero limit', { limit: 0 }, '`limit` must be a positive integer'],
    ['fractional limit', { limit: 1.5 }, '`limit` must be a positive integer'],
    ['slug', { slug: '' }, '`slug` must be a non-empty string'],
    ['description', { description: '' }, '`description` must be a non-empty string'],
    ['overrideAccess', { overrideAccess: true }, 'unknown option `overrideAccess`'],
  ])('throws at creation on an invalid %s', (_, change, message) => {
    expect(() => searchTool({ ...base, ...change } as never)).toThrow(message);
  });

  it('searches lexically without a model', async () => {
    const { ctx, embed, search } = makeCtx();

    await searchTool(base).execute({ query: 'frogs' }, ctx);

    expect(embed).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith({
      collection: 'posts',
      index: 'words',
      query: { text: 'frogs' },
      select: { title: true },
      limit: 10,
      depth: 0,
      req: ctx.req,
      overrideAccess: false,
    });
  });

  it('embeds once and searches hybrid when the index has both parts', async () => {
    const { ctx, embed, search } = makeCtx();

    await searchTool({ ...base, index: 'both', model: 'openai/text-embedding-3-small' }).execute(
      { query: 'frogs' },
      ctx,
    );

    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith({
      model: 'openai/text-embedding-3-small',
      value: 'frogs',
      req: ctx.req,
      overrideAccess: false,
    });
    expect(search.mock.calls[0][0].query).toEqual({ text: 'frogs', vector: [0.1, 0.2, 0.3] });
  });

  it('searches by vector alone on a vector-only index', async () => {
    const { ctx, embed, search } = makeCtx();

    await searchTool({ ...base, index: 'meaning', model: 'openai/text-embedding-3-small' }).execute(
      { query: 'frogs' },
      ctx,
    );

    expect(embed).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0].query).toEqual({ vector: [0.1, 0.2, 0.3] });
  });

  it('asks for a model on an index without lexical search', async () => {
    const { ctx, search } = makeCtx();

    await expect(
      searchTool({ ...base, index: 'meaning' }).execute({ query: 'frogs' }, ctx),
    ).rejects.toThrow(
      "Search index 'meaning' in collection 'posts' has no lexical search, so searchTool needs `model`",
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('asks to remove the model on an index without vector search', async () => {
    const { ctx, embed, search } = makeCtx();

    await expect(
      searchTool({ ...base, model: 'openai/text-embedding-3-small' }).execute(
        { query: 'frogs' },
        ctx,
      ),
    ).rejects.toThrow(
      "Search index 'words' in collection 'posts' has no vector search, so remove `model`",
    );
    expect(embed).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("leaves an unknown index to search's own error", async () => {
    const { ctx, embed, search } = makeCtx();

    await searchTool({ ...base, index: 'missing', model: 'openai/text-embedding-3-small' }).execute(
      { query: 'frogs' },
      ctx,
    );

    expect(embed).not.toHaveBeenCalled();
    expect(search.mock.calls[0][0].query).toEqual({ text: 'frogs' });
  });

  it("forwards the run's overrideAccess and the developer's where and limit", async () => {
    const { ctx, embed, search } = makeCtx({ overrideAccess: true });
    const where = { status: { equals: 'published' } };

    await searchTool({
      ...base,
      index: 'both',
      model: 'openai/text-embedding-3-small',
      where,
      limit: 3,
    }).execute({ query: 'frogs' }, ctx);

    expect(embed.mock.calls[0][0].overrideAccess).toBe(true);
    expect(search.mock.calls[0][0]).toMatchObject({ where, limit: 3, overrideAccess: true });
    expect(search.mock.calls[0][0].where).toBe(where);
  });

  it('returns ranked hits with id, score and the selected fields only', async () => {
    const { ctx } = makeCtx();

    expect(await searchTool(base).execute({ query: 'frogs' }, ctx)).toEqual({
      hits: [
        { id: 2, score: 0.9, title: 'Second' },
        { id: 1, score: 0.4, title: 'First' },
      ],
    });
  });

  it('rethrows a failed search or embed instead of returning no hits', async () => {
    const { ctx, embed, search } = makeCtx();

    search.mockRejectedValueOnce(new Error('Access denied'));

    await expect(searchTool(base).execute({ query: 'frogs' }, ctx)).rejects.toThrow(
      'Access denied',
    );

    embed.mockRejectedValueOnce(new Error('Access denied for AI embed'));

    await expect(
      searchTool({ ...base, index: 'both', model: 'openai/text-embedding-3-small' }).execute(
        { query: 'frogs' },
        ctx,
      ),
    ).rejects.toThrow('Access denied for AI embed');
  });

  it('allows two tools on different indexes and refuses two with one slug', () => {
    const words = searchTool(base);
    const meaning = searchTool({
      ...base,
      index: 'meaning',
      model: 'openai/text-embedding-3-small',
    });

    expect(sanitizeToolList([words, meaning], 'Agent support').map(({ slug }) => slug)).toEqual([
      'search_posts_words',
      'search_posts_meaning',
    ]);
    expect(() => sanitizeToolList([words, searchTool(base)], 'Agent support')).toThrow(
      "Duplicate tool slug 'search_posts_words'",
    );
  });

  describe('sources', () => {
    const hits = [
      { id: 2, score: 0.9, title: 'Second' },
      { id: 3, score: 0.5, body: 'Text' },
      { id: 4, score: 0.1, body: 'Hidden' },
    ];

    it('lists each hit, reading only the titles the hits lack, with the run access', async () => {
      const { ctx, find } = makeCtx();

      await expect(searchTool(base).sources!({ hits }, ctx)).resolves.toEqual([
        { collection: 'posts', id: 2, title: 'Second' },
        { collection: 'posts', id: 3, title: 'Third' },
      ]);
      expect(find).toHaveBeenCalledWith({
        collection: 'posts',
        where: { id: { in: [3, 4] } },
        select: { title: true },
        depth: 0,
        limit: 2,
        pagination: false,
        req: ctx.req,
        overrideAccess: false,
      });
    });

    it('reads nothing when every hit holds its title', async () => {
      const { ctx, find } = makeCtx();

      await expect(searchTool(base).sources!({ hits: hits.slice(0, 1) }, ctx)).resolves.toEqual([
        { collection: 'posts', id: 2, title: 'Second' },
      ]);
      expect(find).not.toHaveBeenCalled();
    });

    it('titles hits by id when the collection has no title field', async () => {
      const { ctx, find } = makeCtx({ useAsTitle: 'id' });

      await expect(searchTool(base).sources!({ hits }, ctx)).resolves.toEqual([
        { collection: 'posts', id: 2, title: '2' },
        { collection: 'posts', id: 3, title: '3' },
        { collection: 'posts', id: 4, title: '4' },
      ]);
      expect(find).not.toHaveBeenCalled();
    });

    it('lists nothing for a skipped call', async () => {
      const { ctx } = makeCtx();

      await expect(searchTool(base).sources!({ skipped: true } as never, ctx)).resolves.toEqual([]);
    });

    it('keeps the hits the model sees unchanged', async () => {
      const { ctx } = makeCtx();

      await expect(searchTool(base).execute({ query: 'frogs' }, ctx)).resolves.toEqual({
        hits: [
          { id: 2, title: 'Second', score: 0.9 },
          { id: 1, title: 'First', score: 0.4 },
        ],
      });
    });
  });
});
