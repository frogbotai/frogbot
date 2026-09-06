import { describe, expect, it, vi } from 'vitest';

import {
  buildBoardOrderField,
  buildBoardOrderHook,
  compileCollectionViews,
  getBoardOrderFieldName,
  getBoardOrderFieldNames,
} from '../../../../packages/frogbot/src/config/collectionViews.js';
import { getCustomCollectionViewByRoute } from '../../../../packages/next/node_modules/@payloadcms/next/dist/views/Root/getCustomCollectionViewByRoute.js';

describe('collection views', () => {
  it('builds per-board order field names and fields', () => {
    expect(getBoardOrderFieldName('by-stage')).toBe('_order_by_stage');
    expect(
      getBoardOrderFieldNames({
        slug: 'posts',
        fields: [],
        admin: { views: [{ type: 'list' }, { type: 'board', slug: 'By Stage' }] },
      }),
    ).toEqual(['_order_by_stage']);

    const field = buildBoardOrderField('_order_by_stage');
    expect(field).toMatchObject({
      name: '_order_by_stage',
      type: 'text',
      index: true,
      admin: { hidden: true, readOnly: true, disableListColumn: true },
    });
    const siblingData = { _order_by_stage: 'a0' };
    field.hooks?.beforeDuplicate?.[0]?.({ siblingData } as never);
    expect(siblingData).toEqual({});
  });

  it('assigns missing board order keys after the last document', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ _order_board: 'a0' }] });
    const data: Record<string, unknown> = {};
    await buildBoardOrderHook(['_order_board'])({
      collection: { slug: 'posts' },
      data,
      originalDoc: {},
      req: { payload: { find } },
    } as never);

    expect(data._order_board).toBe('a1');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ sort: '-_order_board' }));
  });

  it('keeps existing board order keys', async () => {
    const find = vi.fn();
    await buildBoardOrderHook(['_order_board'])({
      collection: { slug: 'posts' },
      data: { _order_board: 'a0' },
      originalDoc: {},
      req: { payload: { find } },
    } as never);
    await buildBoardOrderHook(['_order_board'])({
      collection: { slug: 'posts' },
      data: {},
      originalDoc: { _order_board: 'a0' },
      req: { payload: { find } },
    } as never);
    expect(find).not.toHaveBeenCalled();
  });
  it('provides a default list view', () => {
    const admin = compileCollectionViews({ collection: { slug: 'posts', fields: [] } });

    expect((admin?.custom?.frogbot as any).views).toEqual([
      { type: 'list', slug: 'list', label: 'List', path: '' },
    ]);
    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/next/views#DefaultListView',
    });
    expect(admin?.groupBy).toBe(true);
  });

  it('keeps board Group By runtime support when the list opts out', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [{ name: 'stage', type: 'select', options: [] }],
        admin: {
          views: [
            { type: 'list', groupBy: false },
            { type: 'board', groupBy: 'stage' },
          ],
        },
      },
    });

    expect(admin?.groupBy).toBe(true);
    expect((admin?.custom?.frogbot as any).views[0]).toMatchObject({
      groupBy: false,
      type: 'list',
    });
  });

  it('disables native Group By when an opted-out list has no board', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: { views: [{ type: 'list', groupBy: false }] },
      },
    });

    expect(admin?.groupBy).toBeUndefined();
  });

  it('normalizes slugs and compiles multiple board and custom routes', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [
          { name: 'owner', type: 'relationship', relationTo: 'users' },
          { name: 'stage', type: 'select', options: [] },
        ],
        admin: {
          views: [
            { type: 'list', label: 'Table' },
            { type: 'board', slug: 'By Owner', groupBy: 'owner' },
            { type: 'board', slug: 'By Stage', groupBy: 'stage' },
            { type: 'custom', slug: 'Map View', component: './Map#View' },
          ],
        },
      },
    });

    expect(Object.keys(admin?.components?.views ?? {})).toEqual([
      'list',
      'by-owner',
      'by-stage',
      'map-view',
    ]);
    expect((admin?.custom?.frogbot as any).views.map(({ slug }: any) => slug)).toEqual([
      'list',
      'by-owner',
      'by-stage',
      'map-view',
    ]);
    expect((admin?.custom?.frogbot as any).views[1].orderField).toBe('_order_by_owner');
    expect((admin?.custom?.frogbot as any).views[2].orderField).toBe('_order_by_stage');
    expect(admin?.components?.Description).toBe('@frogbotai/next/views#CollectionViewSwitcher');
    expect(admin?.components?.beforeList).toBeUndefined();
    expect(admin?.groupBy).toBe(true);
    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/next/views#DefaultListView',
    });

    const result = getCustomCollectionViewByRoute({
      adminRoute: '/admin',
      baseRoute: '/collections/posts',
      currentRoute: '/admin/collections/posts/map-view',
      views: admin?.components?.views as never,
    });
    expect(result.view).toEqual({
      payloadComponent: '@frogbotai/next/views#CustomCollectionView',
    });
  });

  it('keeps callbacks out of client metadata', () => {
    const filter = () => ({ owner: { exists: true } });
    const access = () => true;
    let runtime: any[] = [];
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [{ name: 'owner', type: 'relationship', relationTo: 'users' }],
        admin: { views: [{ type: 'board', filter, access, groupBy: 'owner' }] },
      },
      onRuntimeViews: (views) => {
        runtime = views;
      },
    });

    expect((admin?.custom?.frogbot as any).views[0]).not.toHaveProperty('filter');
    expect((admin?.custom?.frogbot as any).views[0]).not.toHaveProperty('access');
    expect(runtime[0]).toMatchObject({ access, filter });
    expect(admin?.components?.views?.list).toMatchObject({
      Component: '@frogbotai/next/views#BoardView',
    });
  });

  it('compiles calendar routes and safe metadata without board ordering', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'events',
        fields: [
          { name: 'startsAt', type: 'date' },
          { name: 'endsAt', type: 'date' },
          { name: 'status', type: 'select', options: [] },
        ],
        admin: {
          views: [
            { type: 'list' },
            {
              type: 'calendar',
              slug: 'Schedule',
              start: 'startsAt',
              end: 'endsAt',
              color: 'status',
              filter: { startsAt: { exists: true } },
              components: { Event: './Event#Event' },
            },
          ],
        },
      },
    });

    expect(admin?.components?.views?.schedule).toEqual({
      Component: '@frogbotai/next/views#CalendarView',
      exact: true,
      path: '/schedule',
    });
    expect((admin?.custom?.frogbot as any).views[1]).toEqual({
      type: 'calendar',
      slug: 'schedule',
      label: 'Calendar',
      path: '/schedule',
      start: 'startsAt',
      end: 'endsAt',
      color: 'status',
    });
    expect((admin?.custom?.frogbot as any).views[1]).not.toHaveProperty('orderField');
  });

  it('validates calendar date and color fields', () => {
    const compile = (view: Record<string, unknown>) =>
      compileCollectionViews({
        collection: {
          slug: 'events',
          fields: [
            { name: 'schedule', type: 'group', fields: [{ name: 'start', type: 'date' }] },
            { name: 'title', type: 'text' },
            { name: 'category', type: 'radio', options: [] },
          ],
          admin: { views: [{ type: 'calendar', start: 'schedule.start', ...view } as never] },
        },
      });

    expect(() => compile({ color: 'category' })).not.toThrow();
    expect(() => compile({ start: 'title' })).toThrow('non-date field "title"');
    expect(() => compile({ end: 'missing' })).toThrow('non-date field "missing"');
    expect(() => compile({ color: 'title' })).toThrow('unsupported color field "title"');
  });

  it('preserves list actions on the default list route', () => {
    const actions = ['./Create#Button'];
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: { views: [{ type: 'list', components: { actions } }] },
      },
    });

    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/next/views#DefaultListView',
      actions,
    });
  });

  it('maps list defaults and pagination to the native list contract', () => {
    const searchableFields = ['title', 'summary'];
    const pagination = { defaultLimit: 25, limits: [25, 50] };
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: {
          useAsTitle: 'title',
          views: [
            {
              type: 'list',
              defaultFields: ['title', 'status'],
              defaultSort: ['-publishedAt', 'title'],
              searchableFields,
              pagination,
            },
          ],
        },
      },
    });

    expect(admin).toMatchObject({
      defaultColumns: ['title', 'status'],
      defaultSort: ['-publishedAt', 'title'],
      listSearchableFields: searchableFields,
      pagination,
    });
    expect(admin?.listSearchableFields).toBe(searchableFields);
  });

  it('moves edit views to the runtime components contract and preserves Description', () => {
    const Description = './Description#Description';
    const root = { Component: './Edit#Root' };
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: { components: { Description, edit: { views: { root } } } },
      },
    });

    expect(admin?.components?.Description).toBe(Description);
    expect(admin?.components?.views?.edit?.root).toBe(root);
    expect((admin?.components?.edit as any).views).toBeUndefined();
  });

  it('preserves an authored Description behind the shared view switcher', () => {
    const Description = './Description#Description';
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [{ name: 'stage', type: 'select', options: [] }],
        admin: {
          components: { Description },
          views: [{ type: 'list' }, { type: 'board', groupBy: 'stage' }],
        },
      },
    });

    expect(admin?.components?.Description).toBe('@frogbotai/next/views#CollectionViewSwitcher');
    expect((admin?.custom?.frogbot as any).descriptionComponent).toBe(Description);
  });

  it('rejects duplicate normalized slugs', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [],
          admin: {
            views: [
              { type: 'list', slug: 'My View' },
              { type: 'board', slug: 'my-view' },
            ],
          },
        },
      }),
    ).toThrow('duplicate normalized view slug "my-view"');
  });

  it('accepts GroupByBuilder field types and rejects unsupported configured fields', () => {
    const supported = [
      'text',
      'textarea',
      'number',
      'select',
      'relationship',
      'date',
      'checkbox',
      'radio',
      'email',
      'upload',
    ];
    for (const type of supported) {
      expect(() =>
        compileCollectionViews({
          collection: {
            slug: 'posts',
            fields: [
              {
                name: 'group',
                type: 'group',
                fields: [{ name: 'value', type, options: [] }],
              } as never,
            ],
            admin: { views: [{ type: 'board', groupBy: 'group.value' }] },
          },
        }),
      ).not.toThrow();
    }
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [{ name: 'content', type: 'richText' }],
          admin: { views: [{ type: 'board', groupBy: 'content' }] },
        },
      }),
    ).toThrow('unsupported groupBy field "content"');
  });

  it('rejects named or non-root list views that the native list renderer cannot route', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [],
          admin: { views: [{ type: 'board' }, { type: 'list', slug: 'table' }] },
        },
      }),
    ).toThrow('supports only one list view and it must be first');

    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [],
          admin: { views: [{ type: 'list' }, { type: 'list', slug: 'archive' }] },
        },
      }),
    ).toThrow('supports only one list view and it must be first');
  });

  it('only permits shell false as the sole view', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [],
          admin: {
            views: [{ type: 'list' }, { type: 'custom', component: './Report', shell: false }],
          },
        },
      }),
    ).toThrow('shell: false must be the sole view');

    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: { views: [{ type: 'custom', component: './Report', shell: false }] },
      },
    });
    expect(admin?.components?.views?.list).toMatchObject({
      Component: '@frogbotai/next/views#CustomCollectionView',
    });
  });
});
