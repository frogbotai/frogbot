import { describe, expect, it, vi } from 'vitest';

import {
  buildColumnWhere,
  getBoardColumnKey,
  getBoardGroupBy,
  getBoardPreferenceKey,
  getBoardPreferenceUpdate,
  getPath,
  resolveBoardGroupBy,
  setPath,
} from '../../../../packages/next/src/views/Board/data.js';
import { resolveActiveViewSlug } from '../../../../packages/next/src/views/Board/resolveActiveView.js';
import {
  resolveBoardField,
  resolveColumns,
} from '../../../../packages/next/src/views/Board/resolveColumns.js';

describe('collection board', () => {
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

  it('builds per-view merged preference updates', () => {
    expect(getBoardPreferenceKey('posts', 'planning')).toBe('collection-posts-view-planning');
    expect(getBoardPreferenceUpdate('posts', 'planning', '-stage')).toEqual([
      'collection-posts-view-planning',
      { groupBy: '-stage' },
      true,
    ]);
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
