import type { Config, Payload } from 'payload';
import { vi } from 'vitest';

import type {
  AdapterSearchArgs,
  AdapterSearchResult,
  AdapterSearchRow,
  SearchAdapter,
} from '../../../../packages/frogbot/src/database/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { withSearchRuntime } from '../../../../packages/frogbot/src/search/runtime.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

export const index = {
  name: 'content',
  lexical: { fields: [{ path: 'title', localized: false }] },
  vector: {
    path: 'embedding',
    localized: false,
    dimensions: 3,
    metric: 'cosine' as const,
    approximate: true,
  },
  hybrid: { fusion: 'rrf' as const, weights: { lexical: 1, vector: 1 } },
  defaultCandidates: 100,
  filterFields: {
    id: { path: 'id', type: 'id' as const, localized: false, many: false },
    title: { path: 'title', type: 'string' as const, localized: false, many: false },
    tenant: { path: 'tenant', type: 'id' as const, localized: false, many: false },
    deletedAt: { path: 'deletedAt', type: 'date' as const, localized: false, many: false },
    _status: { path: '_status', type: 'string' as const, localized: false, many: false },
  },
};

export const faqIndex = {
  name: 'answers',
  lexical: { fields: [{ path: 'question', localized: false }] },
  vector: {
    path: 'embedding',
    localized: false,
    dimensions: 3,
    metric: 'cosine' as const,
    approximate: true,
  },
  hybrid: { fusion: 'rrf' as const, weights: { lexical: 1, vector: 1 } },
  defaultCandidates: 20,
  filterFields: {
    id: { path: 'id', type: 'id' as const, localized: false, many: false },
    question: { path: 'question', type: 'string' as const, localized: false, many: false },
  },
};

export const ranking = { method: 'stub', higherIsBetter: true, approximate: false };

export const hybridRanking = {
  ...ranking,
  components: {
    lexical: { method: 'stub-lexical', higherIsBetter: true, approximate: false },
    vector: { method: 'stub-vector', higherIsBetter: false, approximate: true },
  },
};

type Doc = Record<string, unknown>;

type Read = (args: { req: FrogBotRequest }) => boolean | object;

export function searchFixture({
  docs = [{ id: 1, title: 'stored' }],
  read = () => true,
  rows = [{ id: 1, score: 0.5 }],
  rowRanking = ranking,
  faqs = {},
}: {
  docs?: Doc[];
  read?: Read;
  rows?: AdapterSearchRow[];
  rowRanking?: AdapterSearchResult['ranking'];
  faqs?: { docs?: Doc[]; read?: Read; rows?: AdapterSearchRow[] };
} = {}) {
  const collection = {
    slug: 'articles',
    access: { read },
    trash: true,
    versions: { drafts: true },
    fields: [
      { name: 'title', type: 'text' } as Record<string, unknown>,
      { name: 'embedding', type: 'json' } as Record<string, unknown>,
    ],
    hooks: { beforeOperation: [vi.fn()] } as Record<string, unknown[]>,
  };

  const faqCollection = {
    slug: 'faqs',
    access: { read: faqs.read ?? (() => true) },
    fields: [
      { name: 'question', type: 'text' } as Record<string, unknown>,
      { name: 'embedding', type: 'json' } as Record<string, unknown>,
    ],
    hooks: { beforeOperation: [vi.fn()] } as Record<string, unknown[]>,
  };

  const collectionDocs: Record<string, Doc[]> = {
    articles: docs,
    faqs: faqs.docs ?? [{ id: 7, question: 'stored' }],
  };

  const collectionRows: Record<string, AdapterSearchRow[]> = {
    articles: rows,
    faqs: faqs.rows ?? [{ id: 7, score: 0.4 }],
  };

  const db = {} as Payload['db'];

  const find = vi.fn((args: Record<string, unknown>) =>
    Promise.resolve({ docs: collectionDocs[args.collection as string] }),
  );

  const search = vi.fn(({ collection: slug }: AdapterSearchArgs) =>
    Promise.resolve({ ranking: rowRanking, rows: collectionRows[slug] }),
  );

  const readiness = vi.fn();

  const adapter: SearchAdapter = {
    capabilities: () => ({ lexical: 'supported', vector: 'supported', hybrid: 'supported' }),
    readiness,
    search,
  };

  const payload = {
    collections: { articles: { config: collection }, faqs: { config: faqCollection } },
    config: {
      collections: [collection, faqCollection],
      i18n: { fallbackLanguage: 'en' },
      admin: { user: 'users' },
    },
    db,
    find,
  } as unknown as Payload;

  const createRequest = vi.fn(() => Promise.resolve(req));

  const frogbot = {
    collections: {
      articles: { slug: 'articles', auth: false, search: { content: index } },
      faqs: { slug: 'faqs', auth: false, search: { answers: faqIndex } },
    },
    createRequest,
  } as unknown as FrogBot;

  const req = {
    user: { id: 1, collection: 'users' },
    t: vi.fn(),
    i18n: { t: vi.fn() },
    frogbot,
  } as unknown as FrogBotRequest;

  withSearchRuntime({
    adapter: { defaultIDType: 'number', init: () => db } as unknown as Config['db'],
    collections: [],
    search: adapter,
  }).init({ payload });

  return { adapter, collection, createRequest, find, frogbot, payload, readiness, req, search };
}
