import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AggregateGroupBy, AggregateValues, FrogBotRequest, Where } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { User } from './frogbot-types.js';
import { type AggregateSeed, seedDeals } from './seed.js';
import { dealsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Case = [
  string,
  {
    groupBy: AggregateGroupBy<typeof dealsSlug>;
    values: AggregateValues<typeof dealsSlug>;
    where?: Where;
  },
];

const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

describe(`aggregate access [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let seed: AggregateSeed;
  let run = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'aggregate-access');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    run += 1;
    seed = await seedDeals(booted.frogbot, run);
  });

  const signIn = (user: User): Promise<FrogBotRequest> =>
    booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } });

  const byStage = (options: { req?: FrogBotRequest; overrideAccess?: boolean }) =>
    booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'stage',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      ...options,
    });

  it('requires req unless overrideAccess: true', async () => {
    await expect(byStage({})).rejects.toMatchObject({
      name: 'AggregateValidationError',
      status: 400,
    });
  });

  it('narrows totals by the collection read Where', async () => {
    const { groups } = await byStage({ req: await signIn(seed.users.bo) });

    expect(groups).toEqual([{ group: { stage: 'won' }, values: { deals: 1, total: 300 } }]);
  });

  it('refuses a denied read with 403, or returns no groups with disableErrors', async () => {
    const req = await booted.frogbot.createRequest();

    await expect(byStage({ req })).rejects.toMatchObject({ status: 403 });

    const result = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'stage',
      values: { deals: { count: true } },
      disableErrors: true,
      req,
    });

    expect(result).toMatchObject({ groups: [], totalDocs: 0, totalPages: 0 });
  });

  it('counts every document with overrideAccess: true', async () => {
    const { groups } = await byStage({ overrideAccess: true });

    expect(groups.map(({ values }) => values.deals)).toEqual([2, 2]);
  });

  it.each([
    ['groupBy', { groupBy: 'margin', values: { deals: { count: true } } }],
    ['values', { groupBy: 'stage', values: { margin: { sum: 'margin' } } }],
    [
      'where',
      {
        groupBy: 'stage',
        values: { deals: { count: true } },
        where: { margin: { greater_than: 5 } },
      },
    ],
  ] as Case[])(
    'refuses a field with a read rule in %s, even for a user it allows',
    async (_, options) => {
      for (const user of [seed.users.cy, seed.users.ana]) {
        await expect(
          booted.frogbot.aggregate({ collection: dealsSlug, ...options, req: await signIn(user) }),
        ).rejects.toMatchObject({ status: 403 });
      }

      await expect(
        booted.frogbot.aggregate({ collection: dealsSlug, ...options, overrideAccess: true }),
      ).resolves.toMatchObject({ groups: expect.any(Array) });
    },
  );

  it('sums a field with a read rule when access is overridden', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'stage',
      values: { margin: { sum: 'margin' } },
      overrideAccess: true,
    });

    expect(groups.map(({ values }) => values.margin)).toEqual([10, 20]);
  });

  it.each([
    ['groupBy', { groupBy: 'secret', values: { deals: { count: true } } }],
    ['values', { groupBy: 'stage', values: { secret: { max: 'secret' } } }],
  ] as Case[])('refuses a hidden field in %s, even with overrideAccess', async (_, options) => {
    await expect(
      booted.frogbot.aggregate({ collection: dealsSlug, ...options, overrideAccess: true }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a hidden field in where', async () => {
    await expect(
      booted.frogbot.aggregate({
        collection: dealsSlug,
        groupBy: 'stage',
        values: { deals: { count: true } },
        where: { secret: { equals: 1 } },
        req: await signIn(seed.users.ana),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('applies the related collection read Where to a path through a relationship, keeping documents with no related document', async () => {
    const req = await signIn(seed.users.cy);

    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'account.tier',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      req,
    });

    expect(groups).toEqual([
      { group: { 'account.tier': 'gold' }, values: { deals: 2, total: 700 } },
      { group: { 'account.tier': null }, values: { deals: 1, total: 0 } },
    ]);

    const all = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'account.tier',
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(all.groups.map(({ group }) => group['account.tier'])).toEqual(['gold', 'silver', null]);
  });

  it('refuses a hasMany hop into a collection whose read is a Where', async () => {
    const { acme, hidden } = seed.accounts;

    await booted.frogbot.update({
      collection: dealsSlug,
      id: seed.deals[0].id,
      data: { partners: [acme.id, hidden.id] },
      overrideAccess: true,
    });

    const options = {
      collection: dealsSlug,
      groupBy: 'partners.tier',
      values: { deals: { count: true } },
    } as const;

    await expect(
      booted.frogbot.aggregate({ ...options, req: await signIn(seed.users.cy) }),
    ).rejects.toMatchObject({ name: 'QueryError', status: 400 });

    await expect(
      booted.frogbot.aggregate({
        ...options,
        disableErrors: true,
        req: await signIn(seed.users.cy),
      }),
    ).resolves.toMatchObject({ groups: [], totalDocs: 0 });

    const all = await booted.frogbot.aggregate({ ...options, overrideAccess: true });

    expect(all.groups.map(({ group }) => group['partners.tier'])).toEqual(['gold', 'silver', null]);
  });

  it('keeps an unreadable related document as an ID when populating', async () => {
    const { acme, hidden } = seed.accounts;

    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'account',
      values: { deals: { count: true } },
      depth: 1,
      req: await signIn(seed.users.cy),
    });

    expect(groups.map(({ group }) => group.account)).toEqual([
      expect.objectContaining({ id: acme.id, name: 'Acme' }),
      hidden.id,
      null,
    ]);
  });
});
