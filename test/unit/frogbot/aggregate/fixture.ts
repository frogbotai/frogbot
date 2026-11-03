import type { Config, Payload } from 'payload';
import { vi } from 'vitest';

import { withAggregateRuntime } from '../../../../packages/frogbot/src/aggregate/runtime.js';
import type {
  AdapterAggregateArgs,
  AdapterAggregateResult,
  AggregateAdapter,
} from '../../../../packages/frogbot/src/database/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

type Read = (args: { req: FrogBotRequest }) => boolean | object;

export function aggregateFixture({
  aggregate = true,
  read = () => true,
  result = { rows: [], totalDocs: 0 },
}: {
  aggregate?: boolean;
  read?: Read;
  result?: AdapterAggregateResult;
} = {}) {
  const users = {
    slug: 'users',
    access: { read: () => true },
    flattenedFields: [{ name: 'team', type: 'text' }],
    hooks: {},
  };

  const collection = {
    slug: 'deals',
    access: { read },
    trash: true,
    versions: { drafts: true },
    flattenedFields: [
      { name: 'title', type: 'text' },
      { name: 'stage', type: 'select', options: ['lead', 'won'] },
      { name: 'amount', type: 'number' },
      { name: 'closedAt', type: 'date' },
      { name: 'tags', type: 'select', hasMany: true, options: ['hot'] },
      { name: 'scores', type: 'number', hasMany: true },
      { name: 'data', type: 'json' },
      { name: 'owner', type: 'relationship', relationTo: 'users' },
      { name: 'either', type: 'relationship', relationTo: ['users', 'deals'] },
      {
        name: 'items',
        type: 'array',
        flattenedFields: [{ name: 'quantity', type: 'number' }],
      },
      { name: 'margin', type: 'number', access: { read: () => true } },
      { name: 'secret', type: 'number', hidden: true },
    ],
    hooks: {},
  };

  const db = {} as Payload['db'];

  const adapterAggregate = vi.fn((_: AdapterAggregateArgs) => Promise.resolve(result));

  const adapter: AggregateAdapter = { aggregate: adapterAggregate };

  const find = vi.fn((args: { collection: string; where: { id: { in: unknown[] } } }) =>
    Promise.resolve({ docs: args.where.id.in.map((id) => ({ id, name: `user ${String(id)}` })) }),
  );

  const payload = {
    collections: { deals: { config: collection }, users: { config: users } },
    config: {
      collections: [collection, users],
      i18n: { fallbackLanguage: 'en' },
      admin: { user: 'users' },
    },
    db,
    find,
  } as unknown as Payload;

  const frogbot = { createRequest: vi.fn(() => Promise.resolve(req)) } as unknown as FrogBot;

  const req = {
    user: { id: 1, collection: 'users' },
    t: vi.fn(),
    i18n: { t: vi.fn() },
    frogbot,
  } as unknown as FrogBotRequest;

  withAggregateRuntime({
    adapter: { defaultIDType: 'number', init: () => db } as unknown as Config['db'],
    ...(aggregate ? { aggregate: adapter } : {}),
  }).init({ payload });

  return { adapterAggregate, collection, find, frogbot, payload, req };
}
