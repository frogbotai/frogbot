import { InvalidConfiguration } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  compileCollectionViews,
  hasBoardView,
} from '../../../../packages/frogbot/src/config/collectionViews.js';
import { getCustomCollectionViewByRoute } from '../../../../packages/ui/node_modules/@payloadcms/ui/dist/views/Root/getCustomCollectionViewByRoute.js';

describe('collection views', () => {
  it('finds collections with a board view', () => {
    expect(
      hasBoardView({
        slug: 'posts',
        fields: [],
        admin: { views: [{ type: 'list' }, { type: 'board', slug: 'By Stage' }] },
      }),
    ).toBe(true);
    expect(hasBoardView({ slug: 'posts', fields: [] })).toBe(false);
  });

  it('provides a default list view', () => {
    const admin = compileCollectionViews({ collection: { slug: 'posts', fields: [] } });

    expect(admin?.custom?.frogbot.views).toEqual([
      { type: 'list', slug: 'list', label: 'List', path: '' },
    ]);
    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/ui/admin/rsc#ListView',
    });
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
    expect(admin?.custom?.frogbot.views.map(({ slug }: any) => slug)).toEqual([
      'list',
      'by-owner',
      'by-stage',
      'map-view',
    ]);
    expect(admin?.custom?.frogbot.views[1].orderField).toBe('_order');
    expect(admin?.custom?.frogbot.views[2].orderField).toBe('_order');
    expect(admin?.components?.Description).toBeUndefined();
    expect(admin?.components?.beforeList).toBeUndefined();
    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/ui/admin/rsc#ListView',
    });

    const result = getCustomCollectionViewByRoute({
      adminRoute: '/admin',
      baseRoute: '/collections/posts',
      currentRoute: '/admin/collections/posts/map-view',
      views: admin?.components?.views as never,
    });

    expect(result.view).toEqual({
      payloadComponent: '@frogbotai/ui/admin/rsc#CustomCollectionView',
    });
  });

  it('keeps access, filter and icon out of client metadata', () => {
    const filter = { owner: { exists: true } };
    const access = () => true;
    let runtime: any[] = [];
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [{ name: 'owner', type: 'relationship', relationTo: 'users' }],
        admin: { views: [{ type: 'board', filter, access, groupBy: 'owner', icon: 'tile' }] },
      },
      onRuntimeViews: (views) => {
        runtime = views;
      },
    });

    expect(admin?.custom?.frogbot.views[0]).not.toHaveProperty('filter');
    expect(admin?.custom?.frogbot.views[0]).not.toHaveProperty('access');
    expect(admin?.custom?.frogbot.views[0]).not.toHaveProperty('icon');
    expect(runtime[0]).toMatchObject({ access, filter, icon: 'tile' });
    expect(admin?.components?.views?.list).toMatchObject({
      Component: '@frogbotai/ui/admin/rsc#BoardView',
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
      Component: '@frogbotai/ui/admin/rsc#CalendarView',
      exact: true,
      path: '/schedule',
    });
    expect(admin?.custom?.frogbot.views[1]).toEqual({
      type: 'calendar',
      slug: 'schedule',
      label: 'Calendar',
      path: '/schedule',
      start: 'startsAt',
      end: 'endsAt',
      color: 'status',
    });
    expect(admin?.custom?.frogbot.views[1]).not.toHaveProperty('orderField');
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

  it('compiles a timeline route and metadata', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'tasks',
        fields: [
          { name: 'startDate', type: 'date' },
          { name: 'dueDate', type: 'date' },
          { name: 'project', type: 'relationship', relationTo: 'projects' },
          { name: 'status', type: 'select', options: ['todo', 'done'] },
        ],
        admin: {
          views: [
            { type: 'list' },
            {
              type: 'timeline',
              start: 'startDate',
              end: 'dueDate',
              groupBy: 'project',
              color: 'status',
              scales: ['month', 'week'],
              components: { Bar: './Bar#Bar', beforeTimeline: ['./Before#Before'] },
            },
          ],
        },
      },
    });

    expect(admin?.components?.views?.timeline).toEqual({
      Component: '@frogbotai/ui/admin/rsc#TimelineView',
      exact: true,
      path: '/timeline',
    });
    expect(admin?.custom?.frogbot.views[1]).toEqual({
      type: 'timeline',
      slug: 'timeline',
      label: 'Timeline',
      path: '/timeline',
      start: 'startDate',
      end: 'dueDate',
      groupBy: 'project',
      color: 'status',
      scales: ['month', 'week'],
    });
  });

  it('validates timeline dates, color, groupBy and scales', () => {
    const compile = (view: Record<string, unknown>) =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [
            { name: 'startDate', type: 'date' },
            { name: 'title', type: 'text' },
            { name: 'notes', type: 'json' },
            { name: 'status', type: 'select', options: [] },
          ],
          admin: { views: [{ type: 'timeline', start: 'startDate', ...view } as never] },
        },
      });

    expect(() => compile({ color: 'status', groupBy: 'status', scales: ['day'] })).not.toThrow();
    expect(() => compile({ start: undefined })).toThrow('timeline view "timeline" needs a start');
    expect(() => compile({ start: 'title' })).toThrow(
      'timeline view "timeline" has a non-date field "title"',
    );
    expect(() => compile({ end: 'missing' })).toThrow('non-date field "missing"');
    expect(() => compile({ color: 'title' })).toThrow('unsupported color field "title"');
    expect(() => compile({ groupBy: 'notes' })).toThrow(
      'timeline view "timeline" has an unsupported groupBy field "notes"',
    );
    expect(() => compile({ scales: [] })).toThrow('has scales []');
    expect(() => compile({ scales: ['quarter'] })).toThrow('has scales ["quarter"]');
    expect(() => compile({ scales: ['week', 'week'] })).toThrow('has scales ["week","week"]');
  });

  describe('list summary', () => {
    const compile = (summary: unknown, extra: Record<string, unknown> = {}) =>
      compileCollectionViews({
        collection: {
          slug: 'deals',
          fields: [
            { name: 'name', type: 'text' },
            { name: 'amount', type: 'number' },
            { name: 'scores', type: 'number', hasMany: true },
            { name: 'closedAt', type: 'date' },
            { name: 'owner', type: 'relationship', relationTo: 'users' },
            { name: 'margin', type: 'number', access: { read: () => false } },
            { name: 'secret', type: 'number', hidden: true },
            {
              type: 'row',
              fields: [
                { name: 'details', type: 'group', fields: [{ name: 'odds', type: 'number' }] },
              ],
            },
            {
              name: 'finance',
              type: 'group',
              access: { read: () => true },
              fields: [{ name: 'amount', type: 'number' }],
            },
            {
              name: 'internal',
              type: 'group',
              hidden: true,
              fields: [{ name: 'odds', type: 'number' }],
            },
          ],
          admin: { views: [{ type: 'list', summary } as never] },
          ...extra,
        },
      });

    it('accepts every valid pairing and keeps summary in the client metadata', () => {
      const summary = {
        name: 'count',
        amount: 'avg',
        scores: 'count',
        closedAt: 'max',
        owner: 'count',
        'details.odds': 'sum',
        id: 'count',
        createdAt: 'min',
      };

      expect(compile(summary)?.custom?.frogbot.views[0]).toMatchObject({ summary });
    });

    it.each([
      [{ nope: 'count' }, 'summary names "nope", which is not a field.'],
      [{ name: 'sum' }, 'sets "name" to "sum": a field that is not a number or date takes count.'],
      [{ scores: 'sum' }, 'sets "scores" to "sum"'],
      [{ closedAt: 'avg' }, 'sets "closedAt" to "avg": a date field takes count, min, max.'],
      [{ amount: 'median' }, 'sets "amount" to "median": a number field takes count, sum, avg'],
      [{ margin: 'sum' }, 'names "margin", which is hidden or has its own access.read'],
      [{ secret: 'count' }, 'names "secret", which is hidden or has its own access.read'],
      [
        { 'finance.amount': 'sum' },
        'names "finance.amount", which is hidden or has its own access.read',
      ],
      [
        { 'internal.odds': 'sum' },
        'names "internal.odds", which is hidden or has its own access.read',
      ],
      [['amount'], 'summary must be an object'],
    ])('rejects %j at load, naming the view, path and operation', (summary, message) => {
      expect(() => compile(summary)).toThrow(
        `[frogbot] Collection "deals" list view "list" ${message.startsWith('summary') ? '' : 'summary '}${message}`,
      );
    });

    it('rejects timestamps on a collection without them', () => {
      expect(() => compile({ createdAt: 'max' }, { timestamps: false })).toThrow(
        'summary names "createdAt", which is not a field.',
      );
    });
  });

  describe('fields inside layout containers', () => {
    const compile = (view: Record<string, unknown>) =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [
            { type: 'row', fields: [{ name: 'status', type: 'select', options: [] }] },
            { type: 'collapsible', label: 'Dates', fields: [{ name: 'dueAt', type: 'date' }] },
            { type: 'group', fields: [{ name: 'priority', type: 'radio', options: [] }] },
            {
              name: 'workflow',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'stage', type: 'select', options: [] },
                    { name: 'endsAt', type: 'date' },
                  ],
                },
              ],
            },
            {
              type: 'tabs',
              tabs: [
                { label: 'Kind', fields: [{ name: 'category', type: 'radio', options: [] }] },
                { name: 'meta', fields: [{ name: 'tone', type: 'select', options: [] }] },
              ],
            },
          ],
          admin: { views: [view as never] },
        },
      });

    it.each(['status', 'priority', 'category', 'workflow.stage', 'meta.tone'])(
      'accepts the board groupBy field %s',
      (groupBy) => {
        expect(() => compile({ type: 'board', groupBy })).not.toThrow();
      },
    );

    it.each([
      { start: 'dueAt', color: 'status' },
      { start: 'dueAt', end: 'workflow.endsAt', color: 'priority' },
      { start: 'workflow.endsAt', color: 'category' },
      { start: 'dueAt', color: 'meta.tone' },
    ])('accepts the calendar fields %o', (fields) => {
      expect(() => compile({ type: 'calendar', ...fields })).not.toThrow();
    });
  });

  it('accepts a list view groupBy and rejects an unsupported one', () => {
    const compileList = (groupBy: string) =>
      compileCollectionViews({
        collection: {
          slug: 'deals',
          fields: [
            { name: 'stage', type: 'select', options: ['lead', 'won'] },
            { name: 'notes', type: 'richText' },
            { name: 'link', type: 'relationship', relationTo: ['users', 'deals'] },
            { name: 'label', type: 'text', virtual: true },
          ],
          admin: { views: [{ type: 'list', groupBy }] },
        },
      });

    expect(compileList('stage').custom?.frogbot.views[0]).toMatchObject({ groupBy: 'stage' });
    expect(() => compileList('notes')).toThrow(
      'list view "list" has an unsupported groupBy field "notes"',
    );
    expect(() => compileList('link')).toThrow('unsupported groupBy field "link"');
    expect(() => compileList('label')).toThrow('unsupported groupBy field "label"');
  });

  it('rejects an unsupported groupBy field inside a row', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [{ type: 'row', fields: [{ name: 'content', type: 'richText' }] }],
          admin: { views: [{ type: 'board', groupBy: 'content' }] },
        },
      }),
    ).toThrow('unsupported groupBy field "content"');
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
      Component: '@frogbotai/ui/admin/rsc#ListView',
      actions,
    });
  });

  it.each([
    [
      'board',
      { type: 'board' },
      '@frogbotai/ui/admin/rsc#BoardView',
      [{ name: 'stage', type: 'select', options: [] }],
    ],
    [
      'calendar',
      { type: 'calendar', start: 'startsAt' },
      '@frogbotai/ui/admin/rsc#CalendarView',
      [{ name: 'startsAt', type: 'date' }],
    ],
    [
      'custom',
      { type: 'custom', component: './Report' },
      '@frogbotai/ui/admin/rsc#CustomCollectionView',
      [],
    ],
  ])(
    'maps the actions of a default %s view to the page header',
    (_type, view, Component, fields) => {
      const actions = ['./Header#Action'];
      const admin = compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: fields as never,
          admin: { views: [{ ...view, components: { actions } } as never] },
        },
      });

      expect(admin?.components?.views?.list).toEqual({ Component, actions });
    },
  );

  it('keeps the actions of a non-default view off the list route', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [{ name: 'stage', type: 'select', options: [] }],
        admin: {
          views: [{ type: 'list' }, { type: 'board', components: { actions: ['./A#A'] } }],
        },
      },
    });

    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/ui/admin/rsc#ListView',
    });
    expect(admin?.components?.views?.board).toEqual({
      Component: '@frogbotai/ui/admin/rsc#BoardView',
      exact: true,
      path: '/board',
    });
  });

  it('keeps NoResults on the runtime view of every type', () => {
    const NoResults = './Empty#Empty';
    let runtime: any[] = [];
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [
          { name: 'stage', type: 'select', options: [] },
          { name: 'due', type: 'date' },
        ],
        admin: {
          views: [
            { type: 'list', components: { NoResults } },
            { type: 'board', groupBy: 'stage', components: { NoResults } },
            { type: 'calendar', start: 'due', components: { NoResults } },
          ],
        },
      },
      onRuntimeViews: (views) => {
        runtime = views;
      },
    });

    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/ui/admin/rsc#ListView',
    });
    expect(runtime.map(({ components }) => components?.NoResults)).toEqual([
      NoResults,
      NoResults,
      NoResults,
    ]);
  });

  it('rejects an unknown view icon', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [],
          admin: { views: [{ type: 'list', icon: 'nope' }] },
        },
      }),
    ).toThrow("Unknown admin icon 'nope'");
  });

  it('passes useAsDone to the client config and out of Payload admin', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'tasks',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'progress', type: 'group', fields: [{ name: 'done', type: 'checkbox' }] },
        ],
        admin: { useAsDone: 'progress.done' },
      },
    });

    expect(admin?.custom?.frogbot.useAsDone).toBe('progress.done');
    expect(admin).not.toHaveProperty('useAsDone');
  });

  it.each([
    ['a missing field', 'finished'],
    ['a field that is not a checkbox', 'title'],
    ['a checkbox inside an array', 'items.done'],
    ['a sort-style leading minus', '-done'],
    ['an empty path', ''],
  ])('rejects useAsDone naming %s', (_, useAsDone) => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'done', type: 'checkbox' },
            { name: 'items', type: 'array', fields: [{ name: 'done', type: 'checkbox' }] },
          ],
          admin: { useAsDone },
        },
      }),
    ).toThrow(`Collection "tasks" admin.useAsDone "${useAsDone}" must name a checkbox field`);
  });

  it('accepts a useAsDone checkbox inside an unnamed row', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'tasks',
        fields: [{ type: 'row', fields: [{ name: 'done', type: 'checkbox' }] }],
        admin: { useAsDone: 'done' },
      },
    });

    expect(admin?.custom?.frogbot.useAsDone).toBe('done');
  });

  it('sends panel settings to the client config and keeps them out of Payload admin', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'tasks',
        fields: [
          { name: 'status', type: 'text' },
          { name: 'dates', type: 'group', fields: [{ name: 'due', type: 'date' }] },
          { type: 'tabs', tabs: [{ name: 'meta', fields: [{ name: 'owner', type: 'text' }] }] },
        ],
        admin: {
          components: { panel: { actions: ['./Action#Action'] } },
          panel: { properties: ['status', 'dates.due', 'meta.owner'], width: 640 },
        },
      },
    });

    expect(admin?.custom?.frogbot.panel).toEqual({
      properties: ['status', 'dates.due', 'meta.owner'],
      width: 640,
    });
    expect(admin).not.toHaveProperty('panel');
    expect(admin?.components).not.toHaveProperty('panel');
  });

  it('turns the panel on with the default width when unset, and off with false', () => {
    const on = compileCollectionViews({ collection: { slug: 'tasks', fields: [] } });
    const off = compileCollectionViews({
      collection: { slug: 'tasks', fields: [], admin: { panel: false } },
    });

    expect(on?.custom?.frogbot.panel).toEqual({ width: 560 });
    expect(off?.custom?.frogbot.panel).toBe(false);
  });

  it.each([
    ['a missing field', 'finished'],
    ['a field inside an array', 'items.title'],
    ['an empty path', ''],
  ])('rejects a panel property naming %s, naming the collection and entry', (_, path) => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'items', type: 'array', fields: [{ name: 'title', type: 'text' }] },
          ],
          admin: { panel: { properties: [path] } },
        },
      }),
    ).toThrow(`Collection "tasks" admin.panel.properties entry "${path}" must name a field`);
  });

  it.each([
    ['the same field twice', ['status', 'status'], 'status'],
    ['a group and a field inside it', ['dates', 'dates.due'], 'dates'],
  ])('rejects panel properties naming %s', (_, properties, repeated) => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [
            { name: 'status', type: 'text' },
            { name: 'dates', type: 'group', fields: [{ name: 'due', type: 'date' }] },
          ],
          admin: { panel: { properties } },
        },
      }),
    ).toThrow(`repeats "${repeated}"; each field appears once.`);
  });

  it.each([300, 399, 961, '560', Number.NaN])('rejects a panel width of %s', (width) => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [],
          admin: { panel: { width: width as number } },
        },
      }),
    ).toThrow(`Collection "tasks" admin.panel.width ${width} must be a number from 400 to 960.`);
  });

  it('rejects a function filter, since view entries are plain data', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [{ name: 'stage', type: 'select', options: [] }],
          admin: {
            views: [{ type: 'board', groupBy: 'stage', filter: (() => ({})) as never }],
          },
        },
      }),
    ).toThrow('view "board" has a function filter');
  });

  it('rejects a function anywhere inside a view filter', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [
            { name: 'stage', type: 'select', options: [] },
            { name: 'owner', type: 'relationship', relationTo: 'users' },
          ],
          admin: {
            views: [
              { type: 'list' },
              {
                type: 'board',
                groupBy: 'stage',
                filter: { or: [{ owner: { equals: () => 'me' } }] },
              },
            ],
          },
        },
      }),
    ).toThrow('view "board" has a function filter');
  });

  it("hands a list view's filter to Payload as the baseFilter function Payload calls", async () => {
    const filter = { status: { equals: 'open' } };
    const admin = compileCollectionViews({
      collection: {
        slug: 'tasks',
        fields: [{ name: 'status', type: 'text' }],
        admin: { views: [{ type: 'list', filter }] },
      },
    });

    expect(typeof admin?.baseFilter).toBe('function');
    expect(await admin?.baseFilter?.({ limit: 10, page: 1, req: {} as never, sort: '' })).toEqual(
      filter,
    );
  });

  it('rejects a useAsDone that is not a string with the startup message', () => {
    expect(() =>
      compileCollectionViews({
        collection: {
          slug: 'tasks',
          fields: [{ name: 'done', type: 'checkbox' }],
          admin: { useAsDone: true as never },
        },
      }),
    ).toThrow('must name a checkbox field');
  });

  it('keeps CreateButton on the collection components', () => {
    const CreateButton = './Create#Button';
    const admin = compileCollectionViews({
      collection: { slug: 'posts', fields: [], admin: { components: { CreateButton } } },
    });

    expect((admin?.components as { CreateButton?: unknown }).CreateButton).toBe(CreateButton);
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

  it('keeps an authored Description with several views', () => {
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

    expect(admin?.components?.Description).toBe(Description);
    expect(admin?.custom?.frogbot).not.toHaveProperty('descriptionComponent');
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
      Component: '@frogbotai/ui/admin/rsc#CustomCollectionView',
    });
  });

  it('rejects shell-only components on a shell false view, naming them in order', () => {
    const compile = (components: Record<string, string[]>) =>
      compileCollectionViews({
        collection: {
          slug: 'posts',
          fields: [],
          admin: {
            views: [
              { type: 'custom', slug: 'report', component: './Report', shell: false, components },
            ],
          },
        },
      });

    expect(() => compile({ menuItems: ['./Menu'] })).toThrow(
      '[frogbot] Collection "posts" view "report" sets shell: false, so menuItems would never render. Remove them or drop shell: false.',
    );
    expect(() =>
      compile({ toolbar: ['./T'], menuItems: ['./M'], afterView: ['./A'], beforeView: ['./B'] }),
    ).toThrow('so beforeView, afterView, menuItems, toolbar would never render.');
  });

  it('builds a shell false view with only actions and sends them to the page header', () => {
    const actions = ['./Header#Action'];
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: {
          views: [{ type: 'custom', component: './Report', shell: false, components: { actions } }],
        },
      },
    });

    expect(admin?.components?.views?.list).toEqual({
      Component: '@frogbotai/ui/admin/rsc#CustomCollectionView',
      actions,
    });
  });

  describe('card views', () => {
    const fields = [
      { name: 'name', type: 'text' as const },
      { name: 'logo', type: 'upload' as const, relationTo: 'media' },
      { name: 'stage', type: 'select' as const, options: [] },
      {
        name: 'meta',
        type: 'group' as const,
        fields: [{ name: 'photo', type: 'upload' as const, relationTo: 'media' }],
      },
      {
        type: 'row' as const,
        fields: [{ name: 'banner', type: 'upload' as const, relationTo: 'media' }],
      },
    ];

    it('compiles a gallery route with its card keys in the metadata', () => {
      const admin = compileCollectionViews({
        collection: {
          slug: 'companies',
          fields,
          admin: {
            views: [
              { type: 'list' },
              { type: 'gallery', label: 'Logos', thumbnailFit: 'contain' },
              { type: 'gallery', slug: 'banners', useAsThumbnail: 'banner' },
              { type: 'board', groupBy: 'stage', useAsThumbnail: false },
            ],
          },
        },
      });

      expect(admin?.components?.views?.gallery).toEqual({
        Component: '@frogbotai/ui/admin/rsc#GalleryView',
        exact: true,
        path: '/gallery',
      });
      expect(admin?.custom?.frogbot.views.slice(1)).toEqual([
        {
          type: 'gallery',
          label: 'Logos',
          thumbnailFit: 'contain',
          path: '/gallery',
          slug: 'gallery',
        },
        {
          type: 'gallery',
          label: 'Gallery',
          useAsThumbnail: 'banner',
          path: '/banners',
          slug: 'banners',
        },
        {
          type: 'board',
          groupBy: 'stage',
          label: 'Board',
          orderField: '_order',
          useAsThumbnail: false,
          path: '/board',
          slug: 'board',
        },
      ]);
    });

    it('renders a gallery as the default view', () => {
      const admin = compileCollectionViews({
        collection: { slug: 'media', fields: [], admin: { views: [{ type: 'gallery' }] } },
      });

      expect(admin?.components?.views?.list).toEqual({
        Component: '@frogbotai/ui/admin/rsc#GalleryView',
      });
    });

    it.each([
      ['a missing field', 'photo'],
      ['a nested path', 'meta.photo'],
      ['a field that is not an upload', 'name'],
      ['an empty string', ''],
    ])('rejects a view useAsThumbnail naming %s', (_, useAsThumbnail) => {
      for (const type of ['gallery', 'board'] as const) {
        expect(() =>
          compileCollectionViews({
            collection: {
              slug: 'companies',
              fields,
              admin: { views: [{ type: 'list' }, { type, groupBy: 'stage', useAsThumbnail }] },
            },
          }),
        ).toThrow(
          new RegExp(
            `^\\[frogbot\\] Collection "companies" ${type} view "${type}" has useAsThumbnail "${useAsThumbnail.replace('.', '\\.')}", which must name a top-level upload field or be false\\.$`,
          ),
        );
      }
    });

    it('throws Payload InvalidConfiguration for a bad view useAsThumbnail', () => {
      expect(() =>
        compileCollectionViews({
          collection: {
            slug: 'companies',
            fields,
            admin: { views: [{ type: 'gallery', useAsThumbnail: 'name' }] },
          },
        }),
      ).toThrow(InvalidConfiguration);
    });

    it('accepts a top-level upload field, including one inside a row, and false', () => {
      expect(() =>
        compileCollectionViews({
          collection: {
            slug: 'companies',
            fields,
            admin: {
              views: [
                { type: 'gallery', useAsThumbnail: 'logo' },
                { type: 'gallery', slug: 'banners', useAsThumbnail: 'banner' },
                { type: 'board', groupBy: 'stage', useAsThumbnail: false },
              ],
            },
          },
        }),
      ).not.toThrow();
    });
  });
});
