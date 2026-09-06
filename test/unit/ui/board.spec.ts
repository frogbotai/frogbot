import { describe, expect, it } from 'vitest';

import { groupBoardRows, resolveBoardTarget } from '../../../packages/ui/src/board/useBoard.js';

describe('useBoard', () => {
  it('groups rows in column order and adds uncategorized', () => {
    const result = groupBoardRows({
      columns: [
        { key: 'review', label: 'Review' },
        { key: 'done', label: 'Done' },
      ],
      getId: (row: { id: string }) => row.id,
      groupBy: (row: { stage?: string }) => row.stage,
      rows: [{ id: '1', stage: 'done' }, { id: '2' }],
    });
    expect(result.map(({ key, rows }) => [key, rows.length])).toEqual([
      ['review', 0],
      ['done', 1],
      ['', 1],
    ]);
  });

  it('applies optimistic group overrides', () => {
    const result = groupBoardRows({
      columns: [
        { key: 'review', label: 'Review' },
        { key: 'done', label: 'Done' },
      ],
      getId: (value) => value.id,
      groupBy: (value) => value.stage,
      groupOverrides: { '1': 'done' },
      rows: [{ id: '1', stage: 'review' }],
    });
    expect(result.map(({ rows }) => rows.length)).toEqual([0, 1, 0]);
  });

  it('resolves drop targets from cards, columns, and overrides', () => {
    const rows = [{ id: '1', stage: 'review' }, { id: '2' }];
    const args = {
      getId: (row: { id: string }) => row.id,
      groupBy: (row: { stage?: string }) => row.stage,
      rows,
    };
    expect(resolveBoardTarget({ ...args, overId: '1' })).toBe('review');
    expect(resolveBoardTarget({ ...args, overId: '2' })).toBe('');
    expect(resolveBoardTarget({ ...args, overId: 'done' })).toBe('done');
    expect(resolveBoardTarget({ ...args, groupOverrides: { '1': 'done' }, overId: '1' })).toBe(
      'done',
    );
    expect(resolveBoardTarget({ ...args, overId: null })).toBeNull();
  });
});
