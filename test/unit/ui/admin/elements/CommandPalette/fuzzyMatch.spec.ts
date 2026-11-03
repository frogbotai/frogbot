import { describe, expect, it } from 'vitest';

import {
  filterRows,
  fuzzyMatch,
} from '../../../../../../packages/ui/src/admin/elements/CommandPalette/fuzzyMatch';

describe('fuzzyMatch', () => {
  it('matches a subsequence case-insensitively', () => {
    expect(fuzzyMatch('pst', 'Posts')?.indices).toEqual([0, 2, 3]);
    expect(fuzzyMatch('POS', 'Posts')).not.toBeNull();
  });

  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Posts')).toBeNull();
    expect(fuzzyMatch('sp', 'Posts')).toBeNull();
  });

  it('returns a zero-score empty match for an empty query', () => {
    expect(fuzzyMatch('', 'Posts')).toEqual({ indices: [], score: 0 });
  });

  it('scores leading and consecutive matches higher', () => {
    expect(fuzzyMatch('pa', 'Pages')!.score).toBeGreaterThan(
      fuzzyMatch('pa', 'Media Packs')!.score,
    );
    expect(fuzzyMatch('po', 'Posts')!.score).toBeGreaterThan(fuzzyMatch('ps', 'Posts')!.score);
  });

  it('returns a negative score for a very sparse match', () => {
    expect(fuzzyMatch('az', 'abcdefghijklmnopqrstuvwxyz')!.score).toBeLessThan(0);
  });
});

describe('filterRows', () => {
  const rows = [
    { group: null, label: 'Home', path: '/admin' },
    { group: 'Collections', label: 'Media Packs', path: '/admin/collections/packs' },
    { group: 'Collections', label: 'Pages', path: '/admin/collections/pages' },
    { group: 'Accounts', label: 'Users', path: '/admin/collections/users' },
  ];

  it('groups rows in order when the query is empty', () => {
    expect(filterRows(rows, ' ').map(({ group, rows: items }) => [group, items.length])).toEqual([
      [null, 1],
      ['Collections', 2],
      ['Accounts', 1],
    ]);
  });

  it('ranks matches within each group and drops empty groups', () => {
    expect(filterRows(rows, 'pa')).toEqual([
      {
        group: 'Collections',
        rows: [
          { ...rows[2], matchIndices: [0, 1] },
          { ...rows[1], matchIndices: [6, 7] },
        ],
      },
    ]);
  });
});
