import { describe, expect, it } from 'vitest';

import {
  getBoardColumnKey,
  getBoardColumnState,
} from '../../../../../packages/ui/src/admin/views/Board/data.js';
import {
  adjustColumnTotal,
  getBoardGroupKey,
  toColumnTotals,
} from '../../../../../packages/ui/src/admin/views/Board/totals.js';

describe('board column totals', () => {
  it('keys select groups like the columns and null as Uncategorized', () => {
    expect(
      toColumnTotals(
        [
          { group: { status: 'todo' }, values: { count: 3 } },
          { group: { status: 'done' }, values: { count: 1 } },
          { group: { status: null }, values: { count: 2 } },
        ],
        'status',
      ),
    ).toEqual({
      [getBoardColumnKey('todo')]: 3,
      [getBoardColumnKey('done')]: 1,
      '': 2,
    });
  });

  it('keys relationship groups by id, populated or not', () => {
    const owner = getBoardColumnKey(5);

    expect(getBoardGroupKey(5)).toBe(owner);
    expect(getBoardGroupKey({ id: 5, name: 'Ana' })).toBe(owner);
    expect(
      toColumnTotals(
        [
          { group: { owner: 5 }, values: { count: 2 } },
          { group: { owner: { id: 7, name: 'Bo' } }, values: { count: 1 } },
        ],
        'owner',
      ),
    ).toEqual({ [owner]: 2, [getBoardColumnKey(7)]: 1 });
  });

  it('keys polymorphic relationship groups by collection and id', () => {
    expect(getBoardGroupKey({ relationTo: 'users', value: { id: 5 } })).toBe(
      getBoardColumnKey({ relationTo: 'users', value: 5 }),
    );
  });

  it('reads nested group paths, keyed flat or nested', () => {
    expect(
      toColumnTotals(
        [{ group: { 'workflow.stage': 'a' }, values: { count: 1 } }],
        'workflow.stage',
      ),
    ).toEqual({ [getBoardColumnKey('a')]: 1 });
    expect(
      toColumnTotals(
        [{ group: { workflow: { stage: 'a' } }, values: { count: 4 } }],
        'workflow.stage',
      ),
    ).toEqual({ [getBoardColumnKey('a')]: 4 });
  });

  it('adjusts one total without going below zero', () => {
    expect(adjustColumnTotal({ a: 1 }, 'a', 1)).toEqual({ a: 2 });
    expect(adjustColumnTotal({ a: 0 }, 'a', -1)).toEqual({ a: 0 });
    expect(adjustColumnTotal({}, 'b', 1)).toEqual({ b: 1 });
  });

  it('reads collapsed and hidden keys from a preference, dropping malformed ones', () => {
    expect(getBoardColumnState(undefined)).toEqual({ collapsed: [], hidden: [] });
    expect(
      getBoardColumnState({ collapsed: ['a', 1 as never], hidden: 'b' as never, groupBy: 'x' }),
    ).toEqual({ collapsed: ['a'], hidden: [] });
  });
});
