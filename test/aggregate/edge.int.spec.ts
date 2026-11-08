import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { User } from './frogbot-types.js';
import { type AggregateSeed, seedDeals } from './seed.js';
import { dealsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

describe(`aggregate edges [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let seed: AggregateSeed;
  let run = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'aggregate-edge');
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

  it('groups by a hasMany number field', async () => {
    await booted.frogbot.update({
      collection: dealsSlug,
      id: seed.deals[0].id,
      data: { scores: [1, 2, 2] },
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: dealsSlug,
      id: seed.deals[1].id,
      data: { scores: [2] },
      overrideAccess: true,
    });

    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'scores',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { scores: 1 }, values: { deals: 1, total: 100 } },
      { group: { scores: 2 }, values: { deals: 2, total: 400 } },
      { group: { scores: null }, values: { deals: 2, total: 600 } },
    ]);
  });

  it('groups by two paths through the same related collection', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: ['owner.team', 'owner.name'],
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { 'owner.team': 'blue', 'owner.name': 'Bo' }, values: { deals: 1, total: 300 } },
      { group: { 'owner.team': 'red', 'owner.name': 'Ana' }, values: { deals: 1, total: 100 } },
      { group: { 'owner.team': 'red', 'owner.name': 'Cy' }, values: { deals: 1, total: 600 } },
      { group: { 'owner.team': null, 'owner.name': null }, values: { deals: 1, total: 0 } },
    ]);
  });

  it('groups by a relationship hop and a hasMany hop into one collection', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: ['owner.team', 'watchers.team'],
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { 'owner.team': 'blue', 'watchers.team': 'red' }, values: { deals: 1, total: 300 } },
      { group: { 'owner.team': 'red', 'watchers.team': 'blue' }, values: { deals: 1, total: 100 } },
      { group: { 'owner.team': 'red', 'watchers.team': 'red' }, values: { deals: 1, total: 100 } },
      { group: { 'owner.team': 'red', 'watchers.team': null }, values: { deals: 1, total: 600 } },
      { group: { 'owner.team': null, 'watchers.team': null }, values: { deals: 1, total: 0 } },
    ]);
  });

  it('groups by two hasMany fields as a cross product, each document once per pair', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      where: { title: { equals: 'd1' } },
      groupBy: ['tags', 'lines.product'],
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups.map(({ group }) => [group.tags, group['lines.product']])).toEqual([
      ['big', 'a'],
      ['big', 'b'],
      ['cold', 'a'],
      ['cold', 'b'],
      ['hot', 'a'],
      ['hot', 'b'],
    ]);

    expect(groups.every(({ values }) => values.deals === 1 && values.total === 100)).toBe(true);
  });

  it('groups by id and by a relationship id path', async () => {
    const byID = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'id',
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(byID.totalDocs).toBe(4);
    expect(byID.groups.every(({ values }) => values.deals === 1)).toBe(true);

    const byOwnerID = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'owner.id',
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(byOwnerID.groups.map(({ group }) => group['owner.id'])).toEqual([
      seed.users.ana.id,
      seed.users.bo.id,
      seed.users.cy.id,
      null,
    ]);
  });

  it('groups a plain date field by its stored instant', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'closedAt',
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(groups.map(({ group }) => group.closedAt)).toEqual([
      '2025-12-29T10:00:00.000Z',
      '2026-01-04T23:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
      null,
    ]);
  });

  it('refuses hidden auth fields through a relationship', async () => {
    const req = await signIn(seed.users.ana);

    await expect(
      booted.frogbot.aggregate({
        collection: dealsSlug,
        groupBy: 'owner.hash',
        values: { deals: { count: true } },
        req,
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      booted.frogbot.aggregate({
        collection: dealsSlug,
        groupBy: 'stage',
        values: { deals: { count: true } },
        where: { or: [{ 'owner.salt': { exists: true } }] },
        req,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a hidden field nested in an upper-case AND', async () => {
    await expect(
      booted.frogbot.aggregate({
        collection: dealsSlug,
        groupBy: 'stage',
        values: { deals: { count: true } },
        where: { AND: [{ OR: [{ secret: { equals: 1 } }] }] },
        req: await signIn(seed.users.ana),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('returns an empty page past the last one', async () => {
    const result = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'stage',
      values: { deals: { count: true } },
      limit: 1,
      page: 5,
      overrideAccess: true,
    });

    expect(result).toMatchObject({ groups: [], totalDocs: 2, totalPages: 2, page: 5 });
  });

  it('filters by a path through a relationship while grouping through another', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      where: { 'owner.team': { equals: 'red' } },
      groupBy: 'account.tier',
      values: { total: { sum: 'amount' }, best: { max: 'details.probability' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { 'account.tier': 'gold' }, values: { total: 700, best: 0.5 } },
    ]);
  });

  it('refuses malformed groups, values, sort and paging with 400', async () => {
    const bad = [
      { groupBy: 'lines', values: { deals: { count: true } } },
      { groupBy: 'details', values: { deals: { count: true } } },
      { groupBy: 'stage', values: { s: { sum: 'scores' } } },
      { groupBy: 'stage', values: { s: { sum: 'lines.product' } } },
      { groupBy: 'stage', values: { s: { avg: 'closedAt' } } },
      { groupBy: 'stage', values: { s: { sum: 'owner.team' } } },
      { groupBy: { field: 'stage', by: 'day' }, values: { s: { count: true } } },
      { groupBy: 'stage', values: { stage: { count: true } } },
      { groupBy: 'stage', values: { s: { count: false } } },
      { groupBy: 'stage', values: { s: { count: true, sum: 'amount' } } },
      { groupBy: 'stage', values: { s: { count: true } }, sort: 'nope' },
      { groupBy: 'stage', values: { s: { count: true } }, limit: -1 },
      { groupBy: 'stage', values: { s: { count: true } }, page: 0 },
      { groupBy: [], values: { s: { count: true } } },
      { values: { s: { count: true } }, sort: 's' },
      { values: { s: { count: true } }, limit: 1 },
      { values: { s: { count: true } }, page: 1 },
      { values: { s: { sum: 'scores' } } },
      { groupBy: 'stage', values: {} },
      { groupBy: 'stage..x', values: { s: { count: true } } },
    ];

    for (const options of bad) {
      await expect(
        // @ts-expect-error -- deliberately malformed
        booted.frogbot.aggregate({ collection: dealsSlug, ...options, overrideAccess: true }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});
