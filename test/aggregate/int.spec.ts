import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { type AggregateSeed, seedDeals } from './seed.js';
import { dealsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

describe(`aggregate [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let seed: AggregateSeed;
  let run = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'aggregate-int');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    run += 1;
    seed = await seedDeals(booted.frogbot, run);
  });

  const values = {
    deals: { count: true },
    total: { sum: 'amount' },
    average: { avg: 'amount' },
    smallest: { min: 'amount' },
    largest: { max: 'amount' },
  } as const;

  it('totals each group of one field, keys ascending', async () => {
    const result = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'stage',
      values,
      overrideAccess: true,
    });

    expect(result.groups).toEqual([
      {
        group: { stage: 'lead' },
        values: { deals: 2, total: 100, average: 100, smallest: 100, largest: 100 },
      },
      {
        group: { stage: 'won' },
        values: { deals: 2, total: 900, average: 450, smallest: 300, largest: 600 },
      },
    ]);

    expect(result).toMatchObject({
      totalDocs: 2,
      totalPages: 1,
      page: 1,
      limit: 0,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
      pagingCounter: 1,
    });
  });

  it('groups by two fields, with the missing owner last', async () => {
    const { ana, bo, cy } = seed.users;

    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: ['stage', 'owner'],
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(groups.map(({ group }) => group)).toEqual([
      { stage: 'lead', owner: ana.id },
      { stage: 'lead', owner: null },
      { stage: 'won', owner: bo.id },
      { stage: 'won', owner: cy.id },
    ]);
  });

  it('follows a relationship with a dot path', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'owner.team',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { 'owner.team': 'blue' }, values: { deals: 1, total: 300 } },
      { group: { 'owner.team': 'red' }, values: { deals: 2, total: 700 } },
      { group: { 'owner.team': null }, values: { deals: 1, total: 0 } },
    ]);
  });

  it('puts a hasMany document in one group per value', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'tags',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { tags: 'big' }, values: { deals: 1, total: 100 } },
      { group: { tags: 'cold' }, values: { deals: 2, total: 100 } },
      { group: { tags: 'hot' }, values: { deals: 2, total: 400 } },
      { group: { tags: null }, values: { deals: 1, total: 600 } },
    ]);
  });

  it('puts an array document in one group per row value, counting it once', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'lines.product',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { 'lines.product': 'a' }, values: { deals: 2, total: 400 } },
      { group: { 'lines.product': 'b' }, values: { deals: 1, total: 100 } },
      { group: { 'lines.product': null }, values: { deals: 2, total: 600 } },
    ]);
  });

  it('follows a hasMany relationship, counting a document once per related value', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'watchers.team',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { 'watchers.team': 'blue' }, values: { deals: 1, total: 100 } },
      { group: { 'watchers.team': 'red' }, values: { deals: 2, total: 400 } },
      { group: { 'watchers.team': null }, values: { deals: 2, total: 600 } },
    ]);
  });

  it('counts each document once when the where matches several of its values', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      where: { tags: { in: ['hot', 'big', 'cold'] } },
      groupBy: 'stage',
      values: { deals: { count: true }, total: { sum: 'amount' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      { group: { stage: 'lead' }, values: { deals: 2, total: 100 } },
      { group: { stage: 'won' }, values: { deals: 1, total: 300 } },
    ]);
  });

  it('groups by number and checkbox fields and sums inside a group field', async () => {
    const byWon = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'won',
      values: { deals: { count: true }, probability: { sum: 'details.probability' } },
      overrideAccess: true,
    });

    expect(byWon.groups).toEqual([
      { group: { won: false }, values: { deals: 2, probability: 0.5 } },
      { group: { won: true }, values: { deals: 2, probability: 0.25 } },
    ]);

    const byAmount = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'amount',
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(byAmount.groups.map(({ group }) => group.amount)).toEqual([100, 300, 600, null]);
  });

  it('populates relationship keys at depth 1', async () => {
    const { ana, bo, cy } = seed.users;

    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'owner',
      values: { deals: { count: true } },
      depth: 1,
      populate: { users: { name: true } },
      overrideAccess: true,
    });

    expect(groups.map(({ group }) => group.owner)).toEqual([
      expect.objectContaining({ id: ana.id, name: 'Ana' }),
      expect.objectContaining({ id: bo.id, name: 'Bo' }),
      expect.objectContaining({ id: cy.id, name: 'Cy' }),
      null,
    ]);

    expect(groups[0].group.owner).not.toHaveProperty('team');
  });

  it.each([
    [
      'day',
      [
        ['2025-12-29T00:00:00.000Z', 1],
        ['2026-01-04T00:00:00.000Z', 1],
        ['2026-01-05T00:00:00.000Z', 1],
      ],
    ],
    [
      'week',
      [
        ['2025-12-29T00:00:00.000Z', 2],
        ['2026-01-05T00:00:00.000Z', 1],
      ],
    ],
    [
      'month',
      [
        ['2025-12-01T00:00:00.000Z', 1],
        ['2026-01-01T00:00:00.000Z', 2],
      ],
    ],
    [
      'quarter',
      [
        ['2025-10-01T00:00:00.000Z', 1],
        ['2026-01-01T00:00:00.000Z', 2],
      ],
    ],
    [
      'year',
      [
        ['2025-01-01T00:00:00.000Z', 1],
        ['2026-01-01T00:00:00.000Z', 2],
      ],
    ],
  ] as const)('buckets dates by UTC %s across the year end', async (by, expected) => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: { field: 'closedAt', by },
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(groups.map(({ group, values: { deals } }) => [group.closedAt, deals])).toEqual([
      ...expected,
      [null, 1],
    ]);
  });

  it('returns 0 for empty counts and sums and null for empty averages and extremes', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      where: { amount: { exists: false } },
      groupBy: 'stage',
      values: { ...values, firstClosed: { min: 'closedAt' } },
      overrideAccess: true,
    });

    expect(groups).toEqual([
      {
        group: { stage: 'lead' },
        values: {
          deals: 1,
          total: 0,
          average: null,
          smallest: null,
          largest: null,
          firstClosed: null,
        },
      },
    ]);
  });

  it('totals every matching document in one row without groupBy', async () => {
    const result = await booted.frogbot.aggregate({
      collection: dealsSlug,
      values: { ...values, first: { min: 'closedAt' }, last: { max: 'closedAt' } },
      overrideAccess: true,
    });

    expect(result.groups).toEqual([
      {
        group: {},
        values: {
          deals: 4,
          total: 1000,
          average: expect.closeTo(1000 / 3, 6),
          smallest: 100,
          largest: 600,
          first: '2025-12-29T10:00:00.000Z',
          last: '2026-01-05T00:00:00.000Z',
        },
      },
    ]);

    expect(result).toMatchObject({ totalDocs: 1, totalPages: 1, page: 1, hasNextPage: false });

    const drafts = await booted.frogbot.aggregate({
      collection: dealsSlug,
      values: { deals: { count: true }, total: { sum: 'amount' } },
      where: { stage: { equals: 'won' } },
      draft: true,
      overrideAccess: true,
    });

    expect(drafts.groups).toEqual([{ group: {}, values: { deals: 3, total: 1900 } }]);
  });

  it('returns one row of 0 counts and sums and null for the rest when nothing matches without groupBy', async () => {
    const result = await booted.frogbot.aggregate({
      collection: dealsSlug,
      where: { title: { equals: 'none' } },
      values: { ...values, first: { min: 'closedAt' } },
      overrideAccess: true,
    });

    expect(result.groups).toEqual([
      {
        group: {},
        values: {
          deals: 0,
          total: 0,
          average: null,
          smallest: null,
          largest: null,
          first: null,
        },
      },
    ]);

    expect(result.totalDocs).toBe(1);
  });

  it('returns date minimums and maximums as ISO strings', async () => {
    const { groups } = await booted.frogbot.aggregate({
      collection: dealsSlug,
      where: { stage: { equals: 'won' } },
      groupBy: 'stage',
      values: { first: { min: 'closedAt' }, last: { max: 'closedAt' } },
      overrideAccess: true,
    });

    expect(groups[0].values).toEqual({
      first: '2026-01-04T23:00:00.000Z',
      last: '2026-01-05T00:00:00.000Z',
    });
  });

  it('sorts by value names and by keys descending', async () => {
    const byTotal = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'stage',
      values: { total: { sum: 'amount' } },
      sort: '-total',
      overrideAccess: true,
    });

    expect(byTotal.groups.map(({ group }) => group.stage)).toEqual(['won', 'lead']);

    const byStage = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'owner.team',
      values: { deals: { count: true } },
      sort: ['-owner.team'],
      overrideAccess: true,
    });

    expect(byStage.groups.map(({ group }) => group['owner.team'])).toEqual(['red', 'blue', null]);
  });

  it('pages groups with limit and page', async () => {
    const result = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'tags',
      values: { deals: { count: true } },
      limit: 2,
      page: 2,
      overrideAccess: true,
    });

    expect(result.groups.map(({ group }) => group.tags)).toEqual(['hot', null]);

    expect(result).toMatchObject({
      totalDocs: 4,
      totalPages: 2,
      page: 2,
      limit: 2,
      hasNextPage: false,
      hasPrevPage: true,
      nextPage: null,
      prevPage: 1,
      pagingCounter: 3,
    });
  });

  it('counts published documents unless draft: true, and trashed ones only with trash: true', async () => {
    const count = async (options: { draft?: boolean; trash?: boolean }) => {
      const { groups } = await booted.frogbot.aggregate({
        collection: dealsSlug,
        groupBy: 'stage',
        values: { deals: { count: true }, total: { sum: 'amount' } },
        overrideAccess: true,
        ...options,
      });

      return Object.fromEntries(groups.map(({ group, values: totals }) => [group.stage, totals]));
    };

    expect(await count({})).toEqual({
      lead: { deals: 2, total: 100 },
      won: { deals: 2, total: 900 },
    });

    expect((await count({ draft: true })).won).toEqual({ deals: 3, total: 1900 });

    expect((await count({ trash: true })).lost).toEqual({ deals: 1, total: 50 });
  });

  it('groups a localized field in the requested locale', async () => {
    const english = await booted.frogbot.aggregate({
      collection: dealsSlug,
      groupBy: 'region',
      values: { deals: { count: true } },
      overrideAccess: true,
    });

    expect(english.groups).toEqual([
      { group: { region: 'north' }, values: { deals: 2 } },
      { group: { region: 'south' }, values: { deals: 1 } },
      { group: { region: null }, values: { deals: 1 } },
    ]);

    const french = (draft: boolean) =>
      booted.frogbot.aggregate({
        collection: dealsSlug,
        groupBy: 'region',
        values: { deals: { count: true } },
        locale: 'fr',
        draft,
        overrideAccess: true,
      });

    expect((await french(false)).groups).toEqual([
      { group: { region: 'nord' }, values: { deals: 1 } },
    ]);

    expect((await french(true)).groups).toEqual([
      { group: { region: 'nord' }, values: { deals: 1 } },
      { group: { region: null }, values: { deals: 4 } },
    ]);
  });
});
