import type { Config, Payload } from 'payload';
import { vi } from 'vitest';

import type {
  AdapterSearchRow,
  SearchAdapter,
} from '../../../../packages/frogbot/src/database/types.js';
import type { Frogbot } from '../../../../packages/frogbot/src/frogbot.js';
import { withSearchRuntime } from '../../../../packages/frogbot/src/search/runtime.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';

export const index = {
  name: 'content',
  lexical: { fields: [{ path: 'title', localized: false }] },
  vector: { path: 'embedding', localized: false, dimensions: 3, metric: 'cosine' as const },
  hybrid: { fusion: 'rrf' as const, weights: { lexical: 1, vector: 1 } },
  filterFields: {
    id: { path: 'id', type: 'id' as const, localized: false, many: false },
    title: { path: 'title', type: 'string' as const, localized: false, many: false },
    tenant: { path: 'tenant', type: 'id' as const, localized: false, many: false },
    deletedAt: { path: 'deletedAt', type: 'date' as const, localized: false, many: false },
    _status: { path: '_status', type: 'string' as const, localized: false, many: false },
  },
};

export const ranking = { method: 'stub', higherIsBetter: true, approximate: false };

type Doc = Record<string, unknown>;

export function searchFixture({
  docs = [{ id: 1, title: 'stored' }],
  read = () => true,
  rows = [{ id: 1, score: 0.5 }],
}: {
  docs?: Doc[];
  read?: (args: { req: FrogbotRequest }) => boolean | object;
  rows?: AdapterSearchRow[];
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

  const db = {} as Payload['db'];

  const find = vi.fn(async (_args: Record<string, unknown>) => ({ docs }));

  const search = vi.fn(async () => ({ ranking, rows }));

  const adapter: SearchAdapter = {
    capabilities: () => ({ lexical: 'supported', vector: 'supported', hybrid: 'supported' }),
    search,
  };

  const payload = {
    collections: { articles: { config: collection } },
    config: {
      collections: [collection],
      i18n: { fallbackLanguage: 'en' },
      admin: { user: 'users' },
    },
    db,
    find,
  } as unknown as Payload;

  const frogbot = {
    collections: { articles: { slug: 'articles', auth: false, search: { content: index } } },
  } as unknown as Frogbot;

  const req = {
    user: { id: 1, collection: 'users' },
    t: vi.fn(),
    i18n: { t: vi.fn() },
    frogbot,
  } as unknown as FrogbotRequest;

  withSearchRuntime({
    adapter: { defaultIDType: 'number', init: () => db } as unknown as Config['db'],
    collections: [],
    search: adapter,
  }).init({ payload });

  return { collection, find, frogbot, payload, req, search };
}
