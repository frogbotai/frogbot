import { describe, expect, it } from 'vitest';

import {
  groupBoardRows,
  isBoardNoopDrop,
  resolveBoardDrop,
  resolveBoardTarget,
} from '../../../packages/ui/src/board/useBoard.js';

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

  it('applies optimistic order overrides within a column', () => {
    const result = groupBoardRows({
      columns: [{ key: 'review', label: 'Review' }],
      getId: (value) => value.id,
      groupBy: (value) => value.stage,
      orderOverrides: { review: ['2', '1'] },
      rows: [
        { id: '1', stage: 'review' },
        { id: '2', stage: 'review' },
      ],
    });
    expect(result[0].rows.map(({ id }) => id)).toEqual(['2', '1']);
  });

  it('resolves intra-column drop order and neighbours', () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const getId = ({ id }: { id: string }) => id;
    const toEnd = resolveBoardDrop({ activeId: '1', getId, index: 3, rows });
    expect(toEnd.order).toEqual(['2', '3', '1']);
    expect(toEnd.before).toEqual({ id: '3' });
    expect(toEnd.after).toBeUndefined();
    const toTop = resolveBoardDrop({ activeId: '3', getId, index: 0, rows });
    expect(toTop.order).toEqual(['3', '1', '2']);
    expect(toTop.before).toBeUndefined();
    expect(toTop.after).toEqual({ id: '1' });
    const between = resolveBoardDrop({ activeId: '1', getId, index: 2, rows });
    expect(between.order).toEqual(['2', '1', '3']);
    expect(between.before).toEqual({ id: '2' });
    expect(between.after).toEqual({ id: '3' });
  });

  it('resolves cross-column drop order and neighbours', () => {
    const result = resolveBoardDrop({
      activeId: '1',
      getId: ({ id }) => id,
      index: 1,
      rows: [{ id: '2' }, { id: '3' }],
    });
    expect(result.order).toEqual(['2', '1', '3']);
    expect(result.before).toEqual({ id: '2' });
    expect(result.after).toEqual({ id: '3' });
  });

  it('treats drops adjacent to the source slot as no-ops', () => {
    expect(isBoardNoopDrop({ index: 1, sourceIndex: 1 })).toBe(true);
    expect(isBoardNoopDrop({ index: 2, sourceIndex: 1 })).toBe(true);
    expect(isBoardNoopDrop({ index: 0, sourceIndex: 1 })).toBe(false);
    expect(isBoardNoopDrop({ index: 3, sourceIndex: 1 })).toBe(false);
    expect(isBoardNoopDrop({ index: 0, sourceIndex: -1 })).toBe(false);
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
