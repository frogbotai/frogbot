import type { Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { sql, sqliteD1Adapter } from '../../../packages/db-d1-sqlite/src/index';
import { sqliteD1SearchAdapter } from '../../../packages/frogbot/src/exports/search.js';
import { assertSearchCapability } from '../../../packages/frogbot/src/search/runtime.js';
import type { SearchIndexDescriptor } from '../../../packages/frogbot/src/search/types.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

const capabilities = (index: Partial<SearchIndexDescriptor>) =>
  sqliteD1SearchAdapter.capabilities({
    collection: 'articles',
    db: {} as Payload['db'],
    index: { name: 'content', ...index } as SearchIndexDescriptor,
  });

const lexical = { fields: [{ path: 'title', localized: false }] };

const vector: SearchIndexDescriptor['vector'] = {
  path: 'embedding',
  localized: false,
  dimensions: 3,
  metric: 'cosine',
  approximate: true,
};

const hybrid: SearchIndexDescriptor['hybrid'] = {
  fusion: 'rrf',
  weights: { lexical: 1, vector: 1 },
};

describe('@frogbotai/db-d1-sqlite exports', () => {
  it('exports sqliteD1Adapter as a function', () => {
    expect(typeof sqliteD1Adapter).toBe('function');
  });

  it('exports sql for generated migrations', () => {
    expect(sql).toBeDefined();
  });

  it('declares the D1 search adapter', () => {
    expect(sqliteD1Adapter({ binding: {} as never }).search).toBe(sqliteD1SearchAdapter);
  });
});

describe('D1 search capabilities', () => {
  it('supports lexical search with an FTS5 tokenizer', () => {
    expect(capabilities({ lexical })).toMatchObject({
      lexical: 'supported',
      vector: { unsupported: 'not-implemented' },
      hybrid: { unsupported: 'not-implemented' },
    });
  });

  it('reports lexical languages without a tokenizer as an engine gap', () => {
    expect(capabilities({ lexical: { ...lexical, language: 'french' } }).lexical).toMatchObject({
      unsupported: 'engine-gap',
      detail: expect.stringContaining("'french'"),
    });
  });

  it('reports vector and hybrid search as an engine gap', () => {
    const modes = capabilities({
      lexical,
      vector,
      hybrid,
    });

    expect(modes.vector).toEqual({
      unsupported: 'engine-gap',
      detail: expect.stringMatching(/^Cloudflare D1 has no native vector search/),
    });
    expect(modes.hybrid).toEqual(modes.vector);
  });

  it('rejects vector and hybrid queries with a capability error', () => {
    const search = (mode: 'hybrid' | 'vector') => () =>
      assertSearchCapability({
        adapter: sqliteD1SearchAdapter,
        collection: 'articles',
        db: {} as Payload['db'],
        index: { name: 'content', lexical, vector, hybrid } as SearchIndexDescriptor,
        mode,
      });

    expect(search('vector')).toThrow(
      expect.objectContaining({ name: 'SearchCapabilityError', reason: 'engine-gap', status: 501 }),
    );
    expect(search('hybrid')).toThrow(/content.*articles.*\(hybrid\): engine-gap: Cloudflare D1/);
  });
});
