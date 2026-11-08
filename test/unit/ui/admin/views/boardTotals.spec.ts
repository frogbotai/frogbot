import { describe, expect, it } from 'vitest';

import { getBoardColumnState } from '../../../../../packages/ui/src/admin/views/Board/data.js';
import {
  adjustGroupCount,
  getGroupKey,
  getGroupValueKey,
  toGroupCounts,
} from '../../../../../packages/ui/src/admin/views/groups/keys.js';

describe('board column totals', () => {
  it('keys select groups like the columns and null as Uncategorized', () => {
    expect(
      toGroupCounts(
        [
          { group: { status: 'todo' }, values: { count: 3 } },
          { group: { status: 'done' }, values: { count: 1 } },
          { group: { status: null }, values: { count: 2 } },
        ],
        'status',
      ),
    ).toEqual({
      [getGroupKey('todo')]: 3,
      [getGroupKey('done')]: 1,
      '': 2,
    });
  });

  it('keys relationship groups by id, populated or not', () => {
    const owner = getGroupKey(5);

    expect(getGroupValueKey(5)).toBe(owner);
    expect(getGroupValueKey({ id: 5, name: 'Ana' })).toBe(owner);
    expect(
      toGroupCounts(
        [
          { group: { owner: 5 }, values: { count: 2 } },
          { group: { owner: { id: 7, name: 'Bo' } }, values: { count: 1 } },
        ],
        'owner',
      ),
    ).toEqual({ [owner]: 2, [getGroupKey(7)]: 1 });
  });

  it('keys polymorphic relationship groups by collection and id', () => {
    expect(getGroupValueKey({ relationTo: 'users', value: { id: 5 } })).toBe(
      getGroupKey({ relationTo: 'users', value: 5 }),
    );
  });

  it('reads nested group paths, keyed flat or nested', () => {
    expect(
      toGroupCounts([{ group: { 'workflow.stage': 'a' }, values: { count: 1 } }], 'workflow.stage'),
    ).toEqual({ [getGroupKey('a')]: 1 });
    expect(
      toGroupCounts(
        [{ group: { workflow: { stage: 'a' } }, values: { count: 4 } }],
        'workflow.stage',
      ),
    ).toEqual({ [getGroupKey('a')]: 4 });
  });

  it('adjusts one total without going below zero', () => {
    expect(adjustGroupCount({ a: 1 }, 'a', 1)).toEqual({ a: 2 });
    expect(adjustGroupCount({ a: 0 }, 'a', -1)).toEqual({ a: 0 });
    expect(adjustGroupCount({}, 'b', 1)).toEqual({ b: 1 });
  });

  it('reads collapsed and hidden keys from a preference, dropping malformed ones', () => {
    expect(getBoardColumnState(undefined)).toEqual({ collapsed: [], hidden: [] });
    expect(
      getBoardColumnState({ collapsed: ['a', 1 as never], hidden: 'b' as never, groupBy: 'x' }),
    ).toEqual({ collapsed: ['a'], hidden: [] });
  });
});
