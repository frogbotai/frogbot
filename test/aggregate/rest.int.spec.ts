import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFrogBotSDK } from '../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { User } from './frogbot-types.js';
import { type AggregateSeed, seedDeals } from './seed.js';
import { dealsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';
const route = `/api/${dealsSlug}/aggregate`;

type ErrorBody = { errors: { message: string }[] };

const options = {
  groupBy: 'owner',
  values: { deals: { count: true }, total: { sum: 'amount' } },
  sort: '-total',
} as const;

describe(`aggregate REST [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let seed: AggregateSeed;
  let run = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'aggregate-rest');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    run += 1;
    seed = await seedDeals(booted.frogbot, run);
  });

  const signIn = async (user: User) => {
    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email: user.email,
      password: 'password',
    });

    const headers = { authorization: `JWT ${login.body.token}` };
    const req = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
    });

    return { headers, req };
  };

  it('gives anonymous callers the 403 the collection read access gives', async () => {
    const response = await booted.restClient.post<ErrorBody>(route, options);

    expect(response.status).toBe(403);
  });

  it.each(['cy', 'bo'] as const)(
    'returns the Local API groups for the signed-in user (%s)',
    async (name) => {
      const { headers, req } = await signIn(seed.users[name]);

      const response = await booted.restClient.post(route, options, { headers });
      const local = await booted.frogbot.aggregate({ ...options, collection: dealsSlug, req });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(local);
    },
  );

  it('narrows a guest to the deals their read access allows', async () => {
    const { headers } = await signIn(seed.users.bo);

    const sdk = createFrogBotSDK({ baseURL: `${booted.baseUrl}/api`, headers });
    const result = await sdk.aggregate({ ...options, collection: dealsSlug });

    expect(result.groups).toEqual([
      { group: { owner: seed.users.bo.id }, values: { deals: 1, total: 300 } },
    ]);
  });

  it.each([
    ['overrideAccess', { overrideAccess: true }],
    ['req', { req: {} }],
    ['context', { context: {} }],
    ['collection', { collection: usersSlug }],
    ['select', { select: {} }],
  ])('rejects a body that sets %s with a 400', async (key, extra) => {
    const { headers } = await signIn(seed.users.ana);

    const response = await booted.restClient.post<ErrorBody>(
      route,
      { ...options, ...extra },
      { headers },
    );

    expect(response.status).toBe(400);
    expect(response.body.errors[0].message).toBe(`Aggregate does not support the '${key}' option.`);
  });

  it('rejects malformed JSON with a 400', async () => {
    const { headers } = await signIn(seed.users.ana);

    const response = await fetch(`${booted.baseUrl}${route}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{"groupBy":',
    });

    const { errors } = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(errors[0].message).toBe('Aggregate requires a JSON request body.');
  });

  it('totals without groupBy in one row, as the signed-in user', async () => {
    const { headers } = await signIn(seed.users.bo);

    const response = await booted.restClient.post<{ groups: unknown[] }>(
      route,
      { draft: true, values: { deals: { count: true }, total: { sum: 'amount' } } },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(response.body.groups).toEqual([{ group: {}, values: { deals: 1, total: 300 } }]);
  });

  it('blanks a field with its own read rule, even for an admin', async () => {
    const response = await booted.restClient.post<{
      groups: { values: { margin: number | null } }[];
    }>(
      route,
      { groupBy: 'stage', values: { margin: { sum: 'margin' } } },
      { headers: (await signIn(seed.users.ana)).headers },
    );

    expect(response.status).toBe(200);
    expect(response.body.groups.map(({ values }) => values.margin)).toEqual([null, null]);
  });

  it('does not total over REST a value the REST find hides by a per-document rule', async () => {
    const { headers } = await signIn(seed.users.cy);
    const found = await booted.restClient.get<{ docs: { audit?: number | null }[] }>(
      `/api/${dealsSlug}?limit=100`,
      { headers },
    );

    const visible = found.body.docs
      .map(({ audit }) => audit)
      .filter((value): value is number => typeof value === 'number')
      .reduce((a, b) => a + b, 0);

    expect(visible).toBe(12);

    const response = await booted.restClient.post<{
      groups: { values: { audit: number | null } }[];
    }>(route, { values: { audit: { sum: 'audit' } } }, { headers });

    expect(response.status).toBe(200);
    expect([12, null]).toContain(response.body.groups[0].values.audit);
  });
});
