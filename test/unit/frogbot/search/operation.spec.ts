import type { Config, Payload } from 'payload';
import { APIError } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import type { SearchAdapter } from '../../../../packages/frogbot/src/database/types.js';
import {
  SearchCapabilityError,
  SearchFilterUnsupportedError,
  SearchReadinessError,
  SearchValidationError,
} from '../../../../packages/frogbot/src/search/errors.js';
import { searchOperation } from '../../../../packages/frogbot/src/search/operation.js';
import { resolveSearchPredicate } from '../../../../packages/frogbot/src/search/predicates.js';
import {
  assertSearchCapability,
  withSearchRuntime,
} from '../../../../packages/frogbot/src/search/runtime.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { index, searchFixture } from './fixture.js';

const searchCollections = [{ slug: 'articles', search: { content: index } }];

describe('search operation boundaries', () => {
  it.each([
    [{ text: '' }, 'non-empty'],
    [{ vector: [1, 2] }, 'finite numbers'],
    [{ vector: [1, NaN, 3] }, 'finite numbers'],
    [{ vector: [1, Infinity, 3] }, 'finite numbers'],
    [{ text: 'hello', extra: true }, 'text and/or vector'],
    [{}, 'text and/or vector'],
  ])('rejects invalid query %j before dispatch', async (query, message) => {
    const { frogbot, payload, search } = searchFixture();

    await expect(
      searchOperation(frogbot, payload, { collection: 'articles', index: 'content', query }),
    ).rejects.toThrow(message);

    expect(search).not.toHaveBeenCalled();
  });

  it.each(['absent', 'constructor'])('rejects the unconfigured index name %s', async (name) => {
    const { frogbot, payload } = searchFixture();

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: name,
        query: { text: 'hello' },
      }),
    ).rejects.toThrow(SearchValidationError);
  });

  it('requires request identity and a positive limit before adapter execution', async () => {
    const { frogbot, payload } = searchFixture();

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
      }),
    ).rejects.toThrow('requires req');

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
        limit: 0,
      }),
    ).rejects.toThrow('positive integer');
  });

  it.each([
    [{ depth: -1 }, 'non-negative integer depth'],
    [{ depth: 1.5 }, 'non-negative integer depth'],
    [{ select: true }, 'object select'],
  ])('rejects invalid hydration option %j before dispatch', async (option, message) => {
    const { frogbot, payload, req, search } = searchFixture();

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
        req,
        ...(option as object),
      }),
    ).rejects.toThrow(message);

    expect(search).not.toHaveBeenCalled();
  });

  it('rejects an inherited all-locales request before dispatch', async () => {
    const { frogbot, payload, req } = searchFixture();

    req.locale = 'all';

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
        req,
      }),
    ).rejects.toThrow('one locale');
  });

  it('evaluates collection read access using the real request and combines visibility filters', async () => {
    const read = vi.fn(({ req }: { req: FrogBotRequest }) => ({
      tenant: { equals: req.user?.id },
    }));
    const { collection, req } = searchFixture({ read });

    const where = await resolveSearchPredicate({
      collection: collection as never,
      index,
      req,
      overrideAccess: false,
      draft: false,
      where: { title: { equals: 'hello' } },
    });

    expect(read).toHaveBeenCalledWith(expect.objectContaining({ req }));
    expect(where).toEqual({
      and: [
        { title: { equals: 'hello' } },
        { tenant: { equals: 1 } },
        { deletedAt: { exists: false } },
        { _status: { equals: 'published' } },
      ],
    });
  });

  it('fails closed for unsupported access paths and operators before ranking', async () => {
    const { collection, req } = searchFixture({
      read: () => ({ 'owner.email': { equals: 'hidden' } }),
    });

    await expect(
      resolveSearchPredicate({
        collection: collection as never,
        index,
        req,
        overrideAccess: false,
        draft: false,
      }),
    ).rejects.toThrow("path 'owner.email'");

    await expect(
      resolveSearchPredicate({
        collection: collection as never,
        index,
        req,
        overrideAccess: true,
        draft: false,
        where: { title: { contains: 'hello' } },
      }),
    ).rejects.toThrow("with 'contains'");
  });

  it('rejects non-scalar predicate values rather than forwarding them to a native query', async () => {
    const { collection, req } = searchFixture();

    await expect(
      resolveSearchPredicate({
        collection: collection as never,
        index,
        req,
        overrideAccess: false,
        draft: false,
        where: { tenant: { in: [{ key: 'private' }] } },
      }),
    ).rejects.toThrow("with 'in'");
  });

  it('rejects document-dependent filter access before native execution', async () => {
    const { collection, frogbot, payload, req, search } = searchFixture();

    collection.fields.push({ name: 'tenant', type: 'text', access: { read: async () => true } });

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
        where: { tenant: { equals: 'visitor' } },
        req,
      }),
    ).rejects.toThrow('document-dependent read access');

    expect(search).not.toHaveBeenCalled();
  });

  it('does not rank against a conditional searched-field access callback', async () => {
    const { collection, frogbot, payload, req, search } = searchFixture();

    collection.fields[0].access = { read: async () => false };

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
        req,
      }),
    ).rejects.toThrow('conditional visibility');

    expect(search).not.toHaveBeenCalled();
  });
});

describe('search hydration', () => {
  it('hydrates every ranked row with one read and keeps the adapter rank order', async () => {
    const { find, frogbot, payload, req, search } = searchFixture({
      rows: [
        { id: 3, score: 0.9 },
        { id: 1, score: 0.8 },
        { id: 2, score: 0.7 },
      ],
      docs: [
        { id: 1, title: 'first' },
        { id: 2, title: 'second' },
        { id: 3, title: 'third' },
      ],
    });

    const result = await searchOperation(frogbot, payload, {
      collection: 'articles',
      index: 'content',
      query: { text: 'hello' },
      select: { title: true },
      depth: 1,
      limit: 5,
      req,
    });

    expect(result).toEqual({
      mode: 'lexical',
      ranking: { method: 'stub', higherIsBetter: true, approximate: false },
      hits: [
        { doc: { id: 3, title: 'third' }, score: 0.9 },
        { doc: { id: 1, title: 'first' }, score: 0.8 },
        { doc: { id: 2, title: 'second' }, score: 0.7 },
      ],
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'lexical', query: { text: 'hello' }, limit: 5 }),
    );
    expect(find).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        collection: 'articles',
        where: {
          and: [
            { and: [{ deletedAt: { exists: false } }, { _status: { equals: 'published' } }] },
            { id: { in: [3, 1, 2] } },
          ],
        },
        limit: 3,
        pagination: false,
        depth: 1,
        draft: false,
        overrideAccess: false,
        select: { title: true },
      }),
    );
  });

  it('skips ranked rows the read no longer returns without exposing their scores', async () => {
    const { frogbot, payload, req } = searchFixture({
      rows: [
        { id: 1, score: 0.9 },
        { id: 2, score: 0.8 },
        { id: 3, score: 0.7 },
      ],
      docs: [{ id: 3, title: 'visible' }],
    });

    const result = await searchOperation(frogbot, payload, {
      collection: 'articles',
      index: 'content',
      query: { text: 'hello' },
      req,
    });

    expect(result.hits).toEqual([{ doc: { id: 3, title: 'visible' }, score: 0.7 }]);
    expect(Object.keys(result)).toEqual(['mode', 'ranking', 'hits']);
  });

  it('matches ranked string IDs to hydrated numeric IDs', async () => {
    const { frogbot, payload, req } = searchFixture({
      rows: [{ id: '1', score: 0.5 }],
      docs: [{ id: 1, title: 'stored' }],
    });

    const result = await searchOperation(frogbot, payload, {
      collection: 'articles',
      index: 'content',
      query: { text: 'hello' },
      req,
    });

    expect(result.hits).toEqual([{ doc: { id: 1, title: 'stored' }, score: 0.5 }]);
  });

  it('returns documents shaped by collection and field read hooks as they are', async () => {
    const { collection, frogbot, payload, req } = searchFixture({
      docs: [{ id: 1, title: 'rewritten by a hook' }],
    });

    collection.hooks.beforeOperation.push(vi.fn());
    collection.hooks.beforeRead = [vi.fn()];
    collection.hooks.afterRead = [vi.fn()];
    collection.hooks.afterOperation = [vi.fn()];
    collection.fields[0].hooks = { afterRead: [vi.fn()] };

    const result = await searchOperation(frogbot, payload, {
      collection: 'articles',
      index: 'content',
      query: { text: 'hello' },
      req,
    });

    expect(result.hits).toEqual([{ doc: { id: 1, title: 'rewritten by a hook' }, score: 0.5 }]);
  });

  it('does not read documents when the adapter returns no rows', async () => {
    const { find, frogbot, payload, req } = searchFixture({ rows: [] });

    const result = await searchOperation(frogbot, payload, {
      collection: 'articles',
      index: 'content',
      query: { vector: [1, 0, 0] },
      req,
    });

    expect(result).toEqual({ mode: 'vector', ranking: expect.any(Object), hits: [] });
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    [
      [
        { id: 1, score: 0.5 },
        { id: '1', score: 0.4 },
      ],
      'duplicate',
    ],
    [[{ id: 1, score: NaN }], 'non-finite score'],
    [[{ id: {}, score: 0.5 }], 'object ID'],
  ])('rejects malformed adapter rows (%j, %s)', async (rows) => {
    const { find, frogbot, payload, req } = searchFixture({ rows: rows as never });

    await expect(
      searchOperation(frogbot, payload, {
        collection: 'articles',
        index: 'content',
        query: { text: 'hello' },
        req,
      }),
    ).rejects.toThrow(SearchReadinessError);

    expect(find).not.toHaveBeenCalled();
  });
});

describe('search errors', () => {
  it.each([
    [new SearchValidationError('invalid'), 400],
    [new SearchFilterUnsupportedError('filter'), 400],
    [new SearchReadinessError('not ready'), 503],
    [new SearchCapabilityError('articles', 'content', 'vector', 'not-implemented', 'none'), 501],
  ])('maps %s to HTTP status %i as a public API error', (error, status) => {
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(status);
    expect(error.isPublic).toBe(true);
    expect(error.name).toBe(error.constructor.name);
  });
});

describe('search capability and schema lifecycle', () => {
  it('names the index, mode and not-implemented cause when no adapter implements search', () => {
    expect(() =>
      assertSearchCapability({
        adapter: undefined,
        collection: 'articles',
        db: {} as Payload['db'],
        index,
        mode: 'vector',
      }),
    ).toThrow(/content.*articles.*vector.*not-implemented/);
  });

  it('preserves an adapter-reported engine gap instead of calling it not implemented', () => {
    const adapter = {
      capabilities: () => ({
        lexical: 'supported',
        hybrid: 'supported',
        vector: { unsupported: 'engine-gap', detail: 'No vector engine' },
      }),
    } as unknown as SearchAdapter;

    expect(() =>
      assertSearchCapability({
        adapter,
        collection: 'articles',
        db: {} as Payload['db'],
        index,
        mode: 'vector',
      }),
    ).toThrow(/engine-gap.*No vector engine/);
  });

  it('checks capabilities and hands descriptors to the schema build at database init without wrapping connect', () => {
    const order: string[] = [];
    const connect = vi.fn(async () => {});
    const nativeInit = vi.fn();
    const db = { connect, init: nativeInit } as unknown as Payload['db'];

    const capabilities = vi.fn(() => {
      order.push('capabilities');

      return { lexical: 'supported', vector: 'supported', hybrid: 'supported' } as const;
    });

    const buildSchema = vi.fn(() => {
      order.push('buildSchema');
    });

    const initialized = withSearchRuntime({
      adapter: { init: () => db, defaultIDType: 'number' } as unknown as Config['db'],
      collections: searchCollections,
      search: { buildSchema, capabilities, search: vi.fn() },
    }).init({ payload: {} as Payload });

    expect(initialized).toBe(db);
    expect(initialized.connect).toBe(connect);
    expect(capabilities).toHaveBeenCalledTimes(3);
    expect(buildSchema).toHaveBeenCalledWith({ collections: searchCollections, db });
    expect(order).toEqual(['capabilities', 'capabilities', 'capabilities', 'buildSchema']);
    expect(nativeInit).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails database init with not-implemented before the schema build when no adapter implements search', () => {
    const db = { connect: vi.fn() } as unknown as Payload['db'];

    const wrapped = withSearchRuntime({
      adapter: { init: () => db, defaultIDType: 'number' } as unknown as Config['db'],
      collections: searchCollections,
    });

    expect(() => wrapped.init({ payload: {} as Payload })).toThrow(
      /content.*articles.*lexical.*not-implemented/,
    );
  });

  it('initializes index-free collections without consulting the search adapter', () => {
    const db = {} as Payload['db'];
    const capabilities = vi.fn();
    const buildSchema = vi.fn();

    const initialized = withSearchRuntime({
      adapter: { init: () => db, defaultIDType: 'number' } as unknown as Config['db'],
      collections: [],
      search: { buildSchema, capabilities, search: vi.fn() },
    }).init({ payload: {} as Payload });

    expect(initialized).toBe(db);
    expect(capabilities).not.toHaveBeenCalled();
    expect(buildSchema).not.toHaveBeenCalled();
  });
});
