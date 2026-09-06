import { describe, expect, it, vi } from 'vitest';

import {
  buildBoardReorderBody,
  buildColumnWhere,
  getBoardCardColumns,
  getBoardColumnKey,
  getBoardGroupBy,
  getBoardPreferenceKey,
  getBoardPreferenceUpdate,
  getPath,
  isBoardOrderField,
  parseSort,
  resolveBoardColumnPreferences,
  resolveBoardGroupBy,
  resolveBoardSort,
  serializeSort,
  setPath,
  syncSortRows,
} from '../../../../packages/next/src/views/Board/data.js';
import { resolveActiveViewSlug } from '../../../../packages/next/src/views/Board/resolveActiveView.js';
import {
  resolveBoardField,
  resolveColumns,
} from '../../../../packages/next/src/views/Board/resolveColumns.js';

describe('collection board', () => {
  it('identifies hidden order fields for sort-option filtering', () => {
    expect(isBoardOrderField('_order')).toBe(true);
    expect(isBoardOrderField('_order_by_stage')).toBe(true);
    expect(isBoardOrderField('priority')).toBe(false);
  });
  it('builds Payload reorder requests from positional neighbours', () => {
    expect(
      buildBoardReorderBody({
        before: true,
        collectionSlug: 'posts',
        orderField: '_order_board',
        rowId: 1,
        target: { id: 2, _order_board: 'a0' },
      }),
    ).toEqual({
      collectionSlug: 'posts',
      docsToMove: ['1'],
      newKeyWillBe: 'greater',
      orderableFieldName: '_order_board',
      target: { id: '2', key: 'a0' },
    });
  });
  it('resolves repeated board instances by slug and route path', () => {
    const views = [
      { path: '/planning', slug: 'planning' },
      { path: '/archive', slug: 'archive' },
    ];

    expect(resolveActiveViewSlug({ viewType: 'archive', views })).toBe('archive');
    expect(
      resolveActiveViewSlug({ routeSegments: ['collections', 'posts', 'planning'], views }),
    ).toBe('planning');
  });

  it('resolves select columns in option order', async () => {
    const field = {
      name: 'stage',
      type: 'select',
      options: [
        { label: 'Review', value: 'review' },
        { label: 'Done', value: 'done' },
      ],
    } as never;
    await expect(
      resolveColumns({ collectionSlug: 'posts', field, path: 'stage', req: {} as never }),
    ).resolves.toEqual([
      { key: 'string:review', label: 'Review', value: 'review' },
      { key: 'string:done', label: 'Done', value: 'done' },
    ]);
  });

  it('resolves access-controlled relationship columns with useAsTitle', async () => {
    const findDistinct = vi.fn().mockResolvedValue({ values: [{ stage: { id: 1, name: 'One' } }] });
    const req = {
      collectionConfig: { slug: 'posts' },
      payload: {
        config: {
          admin: { dateFormat: 'MMM d, yyyy' },
          collections: [{ slug: 'stages', admin: { useAsTitle: 'name' } }],
        },
        findDistinct,
      },
    } as never;
    await expect(
      resolveColumns({
        collectionSlug: 'posts',
        field: { name: 'stage', type: 'relationship', relationTo: 'stages' } as never,
        path: 'stage',
        req,
      }),
    ).resolves.toEqual([{ key: 'number:1', label: 'One', value: 1 }]);
    expect(findDistinct).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'posts', field: 'stage', overrideAccess: false, req }),
    );
  });

  it('resolves arbitrary scalar columns without coercing raw values', async () => {
    const findDistinct = vi.fn().mockResolvedValue({
      values: [{ priority: 2 }, { priority: false }],
    });
    const req = {
      collectionConfig: { slug: 'posts' },
      i18n: { t: (key: string) => key },
      payload: {
        config: { admin: { dateFormat: 'MMM d, yyyy' }, collections: [] },
        findDistinct,
      },
    } as never;
    await expect(
      resolveColumns({
        collectionSlug: 'posts',
        field: { name: 'priority', type: 'number' } as never,
        path: 'priority',
        req,
      }),
    ).resolves.toEqual([
      { key: 'number:2', label: '2', value: 2 },
      { key: 'boolean:false', label: 'false', value: false },
    ]);
  });

  it('resolves nested fields and constructs nested update data', () => {
    const fields = [
      { name: 'workflow', type: 'group', fields: [{ name: 'stage', type: 'select' }] },
    ] as never;
    expect(resolveBoardField(fields, 'workflow.stage')).toMatchObject({ name: 'stage' });
    expect(setPath('workflow.stage', 'done')).toEqual({ workflow: { stage: 'done' } });
    expect(getPath({ workflow: { stage: 'done' } }, 'workflow.stage')).toBe('done');
  });

  it('accepts the GroupByBuilder field types and rejects unsupported fields', () => {
    const fields = [
      { name: 'tags', type: 'select', hasMany: true, options: [] },
      { name: 'owners', type: 'relationship', hasMany: true, relationTo: 'users' },
      { name: 'title', type: 'text' },
      { name: 'content', type: 'richText' },
    ] as never;

    expect(resolveBoardField(fields, 'tags')).toMatchObject({ name: 'tags' });
    expect(resolveBoardField(fields, 'owners')).toMatchObject({ name: 'owners' });
    expect(resolveBoardField(fields, 'title')).toMatchObject({ name: 'title' });
    expect(resolveBoardField(fields, 'content')).toBeUndefined();
  });

  it('strips direction only from the selected field path', () => {
    expect(getBoardGroupBy('-workflow.stage')).toBe('workflow.stage');
    expect(getBoardGroupBy('workflow.stage')).toBe('workflow.stage');
  });

  it('resolves groupBy from URL, preference, then board configuration', () => {
    expect(
      resolveBoardGroupBy({
        configuredGroupBy: 'configured',
        hasQueryGroupBy: true,
        preferenceGroupBy: 'saved',
        queryGroupBy: '-query',
      }),
    ).toBe('-query');
    expect(
      resolveBoardGroupBy({
        configuredGroupBy: 'configured',
        hasQueryGroupBy: false,
        preferenceGroupBy: '-saved',
      }),
    ).toBe('-saved');
    expect(resolveBoardGroupBy({ configuredGroupBy: 'configured', hasQueryGroupBy: false })).toBe(
      'configured',
    );
    expect(
      resolveBoardGroupBy({
        configuredGroupBy: 'configured',
        hasQueryGroupBy: true,
        queryGroupBy: '',
      }),
    ).toBe('');
  });

  it('parses and serializes board sort rows', () => {
    const rows = [
      { direction: 'asc' as const, field: 'stage' },
      { direction: 'desc' as const, field: 'priority' },
    ];

    expect(parseSort('stage,-priority')).toEqual(rows);
    expect(parseSort(['stage', '-priority'])).toEqual(rows);
    expect(parseSort('')).toEqual([]);
    expect(serializeSort(rows)).toBe('stage,-priority');
  });

  it('synchronizes external sort while preserving unsaved empty rows', () => {
    const empty = { direction: 'asc' as const, field: '' };
    const rows = [{ direction: 'asc' as const, field: 'stage' }, empty];

    expect(syncSortRows(rows, 'stage')).toBe(rows);
    expect(syncSortRows(rows, '-priority')).toEqual([
      { direction: 'desc', field: 'priority' },
      empty,
    ]);
  });

  it('resolves sort from URL, preference, then board configuration', () => {
    expect(
      resolveBoardSort({
        defaultSort: ['configured', '-createdAt'],
        preferenceSort: 'saved',
        querySort: ['query', '-priority'],
      }),
    ).toBe('query,-priority');
    expect(resolveBoardSort({ defaultSort: 'configured', preferenceSort: '-saved' })).toBe(
      '-saved',
    );
    expect(resolveBoardSort({ defaultSort: ['configured', '-createdAt'] })).toBe(
      'configured,-createdAt',
    );
    expect(resolveBoardSort({})).toBeUndefined();
    expect(resolveBoardSort({ orderField: '_order_board' })).toBe('_order_board');
    expect(resolveBoardSort({ defaultSort: '-priority', orderField: '_order_board' })).toBe(
      '-priority',
    );
  });

  it('builds per-view merged preference updates', () => {
    expect(getBoardPreferenceKey('posts', 'planning')).toBe('collection-posts-view-planning');
    expect(
      getBoardPreferenceUpdate('posts', 'planning', { groupBy: '-stage', sort: 'priority,-name' }),
    ).toEqual([
      'collection-posts-view-planning',
      { groupBy: '-stage', sort: 'priority,-name' },
      true,
    ]);
    expect(getBoardPreferenceUpdate('posts', 'planning', { sort: '' })).toEqual([
      'collection-posts-view-planning',
      { sort: '' },
      true,
    ]);
    expect(
      getBoardPreferenceUpdate('posts', 'planning', {
        columns: [{ accessor: 'title', active: true }],
      }),
    ).toEqual([
      'collection-posts-view-planning',
      { columns: [{ accessor: 'title', active: true }] },
      true,
    ]);
  });

  it('normalizes the raw URL columns string into column preferences', () => {
    expect(
      resolveBoardColumnPreferences({
        defaultFields: ['title', 'stage'],
        queryColumns: '["title","-stage","workflow.owner"]',
        useAsTitle: 'title',
      }),
    ).toEqual([
      { accessor: 'title', active: true },
      { accessor: 'stage', active: false },
      { accessor: 'workflow.owner', active: true },
    ]);
    expect(
      resolveBoardColumnPreferences({
        queryColumns: ['title', '-stage'],
        useAsTitle: 'title',
      }),
    ).toEqual([
      { accessor: 'title', active: true },
      { accessor: 'stage', active: false },
    ]);
  });

  it('resolves board columns from URL, then the board preference, then board defaultFields', () => {
    const preferenceColumns = [
      { accessor: 'title', active: true },
      { accessor: 'stage', active: false },
    ];

    expect(
      resolveBoardColumnPreferences({
        defaultFields: ['title', 'stage'],
        preferenceColumns,
        queryColumns: '["stage"]',
        useAsTitle: 'title',
      }),
    ).toEqual([{ accessor: 'stage', active: true }]);
    expect(
      resolveBoardColumnPreferences({
        defaultFields: ['title', 'stage'],
        preferenceColumns,
        useAsTitle: 'title',
      }),
    ).toEqual(preferenceColumns);
    expect(
      resolveBoardColumnPreferences({
        defaultFields: ['title', 'stage'],
        useAsTitle: 'title',
      }),
    ).toEqual([
      { accessor: 'title', active: true },
      { accessor: 'stage', active: true },
    ]);
  });

  it('seeds board columns from useAsTitle when the board declares no defaultFields', () => {
    expect(resolveBoardColumnPreferences({ useAsTitle: 'title' })).toEqual([
      { accessor: 'title', active: true },
    ]);
    expect(resolveBoardColumnPreferences({ defaultFields: [] })).toEqual([
      { accessor: 'id', active: true },
    ]);
  });

  it('ignores the list view columns when resolving board columns', () => {
    expect(
      resolveBoardColumnPreferences({
        defaultFields: ['stage'],
        preferenceColumns: undefined,
        queryColumns: undefined,
        useAsTitle: 'title',
      }),
    ).toEqual([{ accessor: 'stage', active: true }]);
  });

  it('renders active columns in order and never duplicates the doc title', () => {
    const columns = [
      { accessor: 'title', active: true },
      { accessor: 'stage', active: true },
      { accessor: 'priority', active: false },
      { accessor: 'workflow.owner', active: true },
    ];

    expect(getBoardCardColumns(columns, 'title')).toEqual([
      { accessor: 'stage', active: true },
      { accessor: 'workflow.owner', active: true },
    ]);
    expect(getBoardCardColumns(columns, 'id')).toEqual([
      { accessor: 'title', active: true },
      { accessor: 'stage', active: true },
      { accessor: 'workflow.owner', active: true },
    ]);
  });

  it('renders the doc title alone when no other column is active', () => {
    expect(
      getBoardCardColumns(
        [
          { accessor: 'title', active: true },
          { accessor: 'stage', active: false },
        ],
        'title',
      ),
    ).toEqual([]);
    expect(getBoardCardColumns(undefined, 'title')).toEqual([]);
    expect(getBoardCardColumns([{ accessor: '', active: true }], 'title')).toEqual([]);
  });

  it('merges shared filters with categorized and uncategorized columns', () => {
    const where = { owner: { equals: '1' } };
    expect(buildColumnWhere(where, 'workflow.stage', 2)).toEqual({
      and: [where, { 'workflow.stage': { equals: 2 } }],
    });
    expect(buildColumnWhere(undefined, 'stage', null)).toEqual({ stage: { exists: false } });
    expect(getBoardColumnKey(2)).not.toBe(getBoardColumnKey('2'));
  });
});
