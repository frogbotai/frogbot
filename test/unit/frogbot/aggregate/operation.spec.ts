import { describe, expect, it, vi } from 'vitest';

import {
  AggregateCapabilityError,
  AggregateValidationError,
} from '../../../../packages/frogbot/src/aggregate/errors.js';
import { aggregateOperation } from '../../../../packages/frogbot/src/aggregate/operation.js';
import type { AggregateOptions } from '../../../../packages/frogbot/src/aggregate/types.js';
import { aggregateFixture } from './fixture.js';

const count = { deals: { count: true } } as const;

describe('aggregate operation validation', () => {
  it.each([
    [{ groupBy: 'stage', values: count, select: {} }, "does not accept 'select'"],
    [{ groupBy: 'missing', values: count }, "has no field 'missing'"],
    [{ groupBy: 'data', values: count }, 'no single stored value'],
    [{ groupBy: 'either', values: count }, 'no single stored value'],
    [{ groupBy: 'items', values: count }, 'no single stored value'],
    [{ groupBy: { field: 'stage', by: 'month' }, values: count }, 'not a date field'],
    [{ groupBy: { field: 'closedAt', by: 'hour' }, values: count }, "by 'hour'"],
    [{ groupBy: { field: 'closedAt', by: 'day', tz: 'UTC' }, values: count }, '{ field, by }'],
    [{ groupBy: [], values: count }, 'at least one groupBy'],
    [{ groupBy: ['stage', 'stage'], values: count }, 'more than once'],
    [{ groupBy: 'stage', values: {} }, 'at least one named value'],
    [{ groupBy: 'stage', values: { stage: { count: true } } }, "cannot name a value 'stage'"],
    [{ groupBy: 'stage', values: { '-x': { count: true } } }, "cannot name a value '-x'"],
    [{ groupBy: 'stage', values: { x: { count: false } } }, '{ count: true }'],
    [{ groupBy: 'stage', values: { x: { sum: 'amount', avg: 'amount' } } }, 'one of'],
    [{ groupBy: 'stage', values: { x: { median: 'amount' } } }, 'one of'],
    [{ groupBy: 'stage', values: { x: { sum: 'title' } } }, 'needs a number field'],
    [{ groupBy: 'stage', values: { x: { avg: 'closedAt' } } }, 'needs a number field'],
    [{ groupBy: 'stage', values: { x: { min: 'title' } } }, 'needs a number or date field'],
    [{ groupBy: 'stage', values: { x: { sum: 'scores' } } }, 'one value per document'],
    [{ groupBy: 'stage', values: { x: { sum: 'items.quantity' } } }, 'one value per document'],
    [{ groupBy: 'stage', values: { x: { max: 'owner.team' } } }, 'one value per document'],
    [{ groupBy: 'stage', values: count, sort: 'amount' }, "cannot sort by 'amount'"],
    [{ groupBy: 'stage', values: count, limit: -1 }, 'limit to be an integer of 0 or more'],
    [{ groupBy: 'stage', values: count, page: 0 }, 'page to be an integer of 1 or more'],
    [{ groupBy: 'stage', values: count, depth: 1.5 }, 'depth to be an integer'],
    [{ groupBy: 'stage', values: count, draft: 'yes' }, 'draft to be a boolean'],
    [{ groupBy: 'stage', values: count, where: [] }, 'where to be an object'],
    [{ groupBy: 'stage', values: count, locale: 'all' }, 'single locale'],
  ])('refuses %j with a 400', async (options, message) => {
    const { adapterAggregate, frogbot, payload, req } = aggregateFixture();

    const error = await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      req,
      ...(options as object),
    } as never).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateValidationError);
    expect(error).toMatchObject({ status: 400 });
    expect((error as Error).message).toContain(message);
    expect(adapterAggregate).not.toHaveBeenCalled();
  });

  it('refuses an unknown collection', async () => {
    const { frogbot, payload, req } = aggregateFixture();

    await expect(
      aggregateOperation(frogbot, payload, {
        collection: 'missing',
        groupBy: 'stage',
        values: count,
        req,
      }),
    ).rejects.toThrow("collection 'missing' cannot run");
  });

  it('requires req unless overrideAccess: true', async () => {
    const { frogbot, payload } = aggregateFixture();

    await expect(
      aggregateOperation(frogbot, payload, {
        collection: 'deals',
        groupBy: 'stage',
        values: count,
      }),
    ).rejects.toThrow('requires req unless overrideAccess: true');
  });

  it('refuses with a 501 when the adapter has no aggregate', async () => {
    const { frogbot, payload, req } = aggregateFixture({ aggregate: false });

    await expect(
      aggregateOperation(frogbot, payload, {
        collection: 'deals',
        groupBy: 'stage',
        values: count,
        req,
      }),
    ).rejects.toThrow(AggregateCapabilityError);
  });

  it.each<[string, Omit<AggregateOptions, 'collection'>]>([
    ['a hidden group', { groupBy: 'secret', values: count, overrideAccess: true }],
    ['a hidden filter', { groupBy: 'stage', values: count, where: { secret: { equals: 1 } } }],
    ['a group the field read rule denies', { groupBy: 'margin', values: count }],
  ])('refuses %s with a 403', async (_, options) => {
    const { adapterAggregate, frogbot, payload, req } = aggregateFixture({
      marginRead: () => false,
    });

    await expect(
      aggregateOperation(frogbot, payload, { collection: 'deals', req, ...options }),
    ).rejects.toMatchObject({ status: 403 });

    expect(adapterAggregate).not.toHaveBeenCalled();
  });
});

describe('aggregate field read rules', () => {
  it('groups, sums and filters by a field whose read rule allows the user', async () => {
    const marginRead = vi.fn(() => true);
    const { adapterAggregate, frogbot, payload, req } = aggregateFixture({ marginRead });

    await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: 'margin',
      values: { m: { sum: 'margin' } },
      where: { AND: [{ margin: { greater_than: 1 } }] },
      req,
    });

    expect(marginRead).toHaveBeenCalledWith(expect.objectContaining({ req }));
    expect(adapterAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        groupBy: [{ path: 'margin', type: 'number' }],
        values: [{ operation: 'sum', path: 'margin', type: 'number' }],
      }),
    );
  });

  it('blanks only the column whose read rule denies the user, and drops its sort', async () => {
    const { adapterAggregate, frogbot, payload, req } = aggregateFixture({
      marginRead: () => false,
      result: { rows: [{ group: ['won'], values: ['3', '900'] }], totalDocs: 3 },
    });

    const { groups } = await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: 'stage',
      values: { deals: { count: true }, m: { sum: 'margin' }, total: { sum: 'amount' } },
      sort: ['-m', 'total'],
      req,
    });

    expect(groups).toEqual([
      { group: { stage: 'won' }, values: { deals: 3, m: null, total: 900 } },
    ]);
    expect(adapterAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [{ operation: 'count' }, { operation: 'sum', path: 'amount', type: 'number' }],
        sort: [
          { target: 'value', index: 1, direction: 'asc' },
          { target: 'group', index: 0, direction: 'asc' },
        ],
      }),
    );
  });

  it('fills the one row without groupBy, blanking a denied column', async () => {
    const { frogbot, payload, req } = aggregateFixture({ marginRead: () => false });

    const { groups } = await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      values: { deals: { count: true }, m: { sum: 'margin' } },
      req,
    });

    expect(groups).toEqual([{ group: {}, values: { deals: 0, m: null } }]);
  });

  it('runs no field read rule with overrideAccess: true', async () => {
    const marginRead = vi.fn(() => false);
    const { adapterAggregate, frogbot, payload } = aggregateFixture({ marginRead });

    await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: 'stage',
      values: { m: { sum: 'margin' } },
      overrideAccess: true,
    });

    expect(marginRead).not.toHaveBeenCalled();
    expect(adapterAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ values: [{ operation: 'sum', path: 'margin', type: 'number' }] }),
    );
  });
});

describe('aggregate operation', () => {
  it('hands the adapter one Where with read access, trash and draft filters', async () => {
    const read = vi.fn(() => ({ owner: { equals: 1 } }));
    const { adapterAggregate, frogbot, payload, req } = aggregateFixture({ read });

    await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: [{ field: 'closedAt', by: 'week' }, 'stage'],
      values: { total: { sum: 'amount' }, deals: { count: true }, last: { max: 'closedAt' } },
      sort: '-total',
      limit: 5,
      page: 2,
      req,
    });

    expect(adapterAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'deals',
        groupBy: [
          { path: 'closedAt', type: 'date', by: 'week' },
          { path: 'stage', type: 'string' },
        ],
        values: [
          { operation: 'sum', path: 'amount', type: 'number' },
          { operation: 'count' },
          { operation: 'max', path: 'closedAt', type: 'date' },
        ],
        sort: [
          { target: 'value', index: 0, direction: 'desc' },
          { target: 'group', index: 0, direction: 'asc' },
          { target: 'group', index: 1, direction: 'asc' },
        ],
        limit: 5,
        page: 2,
        where: {
          and: [
            { owner: { equals: 1 } },
            { deletedAt: { exists: false } },
            { _status: { equals: 'published' } },
          ],
        },
      }),
    );
  });

  it('turns database values into numbers, booleans and ISO dates', async () => {
    const { frogbot, payload, req } = aggregateFixture({
      result: {
        rows: [
          { group: ['2026-01-05 00:00:00+00', 'won'], values: ['1200.5000', '3', null, null] },
          { group: [new Date('2026-01-12T00:00:00.000Z'), null], values: [null, 0, '7.5', 9] },
        ],
        totalDocs: 3,
      },
    });

    const result = await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: [{ field: 'closedAt', by: 'week' }, 'stage'],
      values: {
        total: { sum: 'amount' },
        deals: { count: true },
        average: { avg: 'amount' },
        largest: { max: 'amount' },
      },
      limit: 2,
      req,
    });

    expect(result).toEqual({
      groups: [
        {
          group: { closedAt: '2026-01-05T00:00:00.000Z', stage: 'won' },
          values: { total: 1200.5, deals: 3, average: null, largest: null },
        },
        {
          group: { closedAt: '2026-01-12T00:00:00.000Z', stage: null },
          values: { total: 0, deals: 0, average: 7.5, largest: 9 },
        },
      ],
      totalDocs: 3,
      totalPages: 2,
      page: 1,
      limit: 2,
      hasNextPage: true,
      hasPrevPage: false,
      nextPage: 2,
      prevPage: null,
      pagingCounter: 1,
    });
  });

  it('returns no groups when read access is false and errors are disabled', async () => {
    const { adapterAggregate, frogbot, payload, req } = aggregateFixture({ read: () => false });

    const result = await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: 'stage',
      values: count,
      disableErrors: true,
      req,
    });

    expect(result).toMatchObject({ groups: [], totalDocs: 0 });
    expect(adapterAggregate).not.toHaveBeenCalled();
  });

  it('populates relationship keys at depth 1 with the caller access', async () => {
    const { find, frogbot, payload, req } = aggregateFixture({
      result: {
        rows: [
          { group: [1], values: [2] },
          { group: [null], values: [1] },
        ],
        totalDocs: 2,
      },
    });

    const { groups } = await aggregateOperation(frogbot, payload, {
      collection: 'deals',
      groupBy: 'owner',
      values: count,
      depth: 1,
      populate: { users: { team: true } },
      req,
    });

    expect(groups.map(({ group }) => group.owner)).toEqual([{ id: 1, name: 'user 1' }, null]);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        depth: 0,
        overrideAccess: false,
        select: { team: true },
        where: { id: { in: [1] } },
      }),
    );
  });
});
