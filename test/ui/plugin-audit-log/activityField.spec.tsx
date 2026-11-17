import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ActivityField,
  type ActivityFieldProps,
} from '../../../packages/plugins/plugin-audit-log/src/rsc/ActivityField.js';

const fields = [
  { name: 'title', type: 'text' },
  {
    type: 'tabs',
    tabs: [{ label: 'Details', fields: [{ name: 'summary', type: 'text', label: 'Summary' }] }],
  },
  { type: 'row', fields: [{ name: 'priority', type: 'text' }] },
];

const record = {
  id: 1,
  title: 'A',
  summary: 'B',
  priority: 'high',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const payload: NonNullable<ActivityFieldProps['req']>['payload'] = {
  collections: { tickets: { config: { fields } }, 'audit-logs': { config: { fields: [] } } },
  config: {},
  findByID: () => Promise.resolve(record),
  find: () =>
    Promise.resolve({
      docs: [
        {
          id: 'e2',
          operation: 'update',
          timestamp: '2025-01-03T00:00:00.000Z',
          changes: { priority: { old: 'low', new: 'high' } },
        },
        {
          id: 'e1',
          operation: 'update',
          timestamp: '2025-01-02T00:00:00.000Z',
          changes: { summary: { old: 'A', new: 'B' } },
        },
      ],
    }),
};

const lines = (html: string) =>
  [...html.matchAll(/<p class="fb-activity__line">(.*?)<\/p>/g)].map(([, text]) =>
    text.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'"),
  );

describe('ActivityField', () => {
  it('names a changed field that sits in an unnamed tab or a row', async () => {
    const node = await ActivityField({
      collectionSlug: 'tickets',
      id: 1,
      req: { payload, user: { id: 1 } },
    });

    const text = renderToStaticMarkup(node).replace(/<[^>]+>/g, '|');

    expect(text).toContain('changed |Priority| to |high|');
    expect(text).toContain('changed |Summary| to |B|');
  });

  it('uses translated labels for changed fields and the heading', async () => {
    const translated: NonNullable<ActivityFieldProps['req']>['payload'] = {
      ...payload,
      collections: {
        ...payload.collections,
        ledgers: {
          config: {
            fields: [
              { name: 'priority', type: 'text', label: { en: 'Urgency', de: 'Dringlichkeit' } },
            ],
          },
        },
      },
    };

    const node = await ActivityField({
      collectionSlug: 'ledgers',
      field: { label: { en: 'History', de: 'Verlauf' } },
      i18n: { fallbackLanguage: 'en', language: 'de', t: (key: string) => key },
      id: 1,
      req: { payload: translated, user: { id: 1 } },
    });

    const text = renderToStaticMarkup(node).replace(/<[^>]+>/g, '|');

    expect(text).toContain('Verlauf');
    expect(text).toContain('changed |Dringlichkeit| to |high|');
  });

  it('shows each new value by label, and a related record it cannot read by id', async () => {
    const lookups: Array<{ collection: string; where: unknown }> = [];
    const deals: NonNullable<ActivityFieldProps['req']>['payload'] = {
      collections: {
        'audit-logs': { config: { fields: [{ name: 'user', relationTo: 'users' }] } },
        users: { config: { admin: { useAsTitle: 'fullName' }, fields: [] } },
        companies: { config: { admin: { useAsTitle: 'name' }, fields: [] } },
        deals: {
          config: {
            fields: [
              {
                name: 'stage',
                type: 'select',
                options: [
                  { label: { en: 'Lead', de: 'Interessent' }, value: 'lead' },
                  { label: 'Qualified', value: 'qualified' },
                ],
              },
              { name: 'tags', type: 'select', hasMany: true, options: ['hot', 'cold'] },
              { name: 'owner', type: 'relationship', relationTo: 'users' },
              { name: 'party', type: 'relationship', relationTo: ['users', 'companies'] },
              { name: 'won', type: 'checkbox' },
              { name: 'notes', type: 'richText' },
              { name: 'secret', type: 'text' },
            ],
          },
        },
      },
      config: {},
      findByID: () =>
        Promise.resolve({
          id: 1,
          stage: 'qualified',
          tags: [],
          owner: 2,
          party: null,
          won: true,
          notes: null,
        }),
      find: (args) => {
        if (args.collection === 'audit-logs') {
          return Promise.resolve({
            docs: [
              {
                id: 'e1',
                operation: 'update',
                timestamp: '2025-01-02T00:00:00.000Z',
                user: { id: 2, fullName: 'Ana Park', email: 'ana@example.com' },
                changes: {
                  stage: { old: 'lead', new: 'qualified' },
                  tags: { old: ['hot'], new: ['hot', 'cold'] },
                  owner: { old: 2, new: 3 },
                  party: { old: null, new: { relationTo: 'companies', value: 7 } },
                  won: { old: null, new: true },
                  notes: { old: null, new: { root: {} } },
                  secret: { old: 'a', new: 'b' },
                },
              },
            ],
          });
        }

        lookups.push({ collection: args.collection, where: args.where });

        return Promise.resolve({
          docs:
            args.collection === 'users'
              ? [{ id: 2, fullName: 'Ana Park' }]
              : [{ id: 7, name: 'Acme' }],
        });
      },
    };

    const node = await ActivityField({
      collectionSlug: 'deals',
      i18n: { fallbackLanguage: 'en', language: 'de', t: (key: string) => key },
      id: 1,
      req: { payload: deals, user: { id: 2 } },
    });

    const html = renderToStaticMarkup(node);

    expect(html).not.toContain('Secret');
    expect(lines(html)).toEqual([
      'Ana Park changed Stage to Qualified · 02.01.2025',
      'Ana Park changed Tags to hot, cold · 02.01.2025',
      'Ana Park changed Owner to #3 · 02.01.2025',
      'Ana Park changed Party to Acme · 02.01.2025',
      'Ana Park changed Won to Yes · 02.01.2025',
      'Ana Park changed Notes · 02.01.2025',
    ]);
    expect(lookups).toEqual([
      { collection: 'users', where: { id: { in: [2, 3] } } },
      { collection: 'companies', where: { id: { in: [7] } } },
    ]);
  });

  it('says cleared for an emptied value, adds the time to same-day dates, and skips no-op values', async () => {
    const edges: NonNullable<ActivityFieldProps['req']>['payload'] = {
      collections: {
        'audit-logs': { config: { fields: [] } },
        deals: {
          config: {
            fields: [
              { name: 'title', type: 'text' },
              { name: 'due', type: 'date' },
              { name: 'won', type: 'checkbox' },
            ],
          },
        },
      },
      config: {},
      findByID: () => Promise.resolve({ id: 1, title: '', due: null, won: false }),
      find: () =>
        Promise.resolve({
          docs: [
            {
              id: 'e1',
              operation: 'update',
              timestamp: '2025-01-02T00:00:00.000Z',
              changes: {
                title: { old: 'Q9', new: '' },
                due: { old: '2026-03-01T09:00:00.000Z', new: '2026-03-01T15:00:00.000Z' },
                won: { old: null, new: false },
              },
            },
          ],
        }),
    };

    const node = await ActivityField({
      collectionSlug: 'deals',
      id: 1,
      req: { payload: edges, user: { id: 1 } },
    });

    const [title, due, ...rest] = lines(renderToStaticMarkup(node));

    expect(title).toBe('Someone cleared Title · Jan 2, 2025');
    expect(due).toMatch(/^Someone changed Due to Mar 1, 2026, \d/);
    expect(rest).toEqual([]);
  });

  it('groups changes by the same person a few minutes apart into one run, oldest first', async () => {
    const entry = (id: string, user: number, timestamp: string) => ({
      id,
      operation: 'update',
      timestamp,
      user: { id: user, email: `user${user}@x.io` },
      changes: { title: { old: 'a', new: id } },
    });

    const runs: NonNullable<ActivityFieldProps['req']>['payload'] = {
      ...payload,
      find: () =>
        Promise.resolve({
          docs: [
            entry('e4', 1, '2025-01-01T11:00:00.000Z'),
            entry('e3', 2, '2025-01-01T10:06:00.000Z'),
            entry('e2', 1, '2025-01-01T10:05:00.000Z'),
            entry('e1', 1, '2025-01-01T10:00:00.000Z'),
          ],
        }),
    };

    const node = await ActivityField({
      collectionSlug: 'tickets',
      id: 1,
      req: { payload: runs, user: { id: 1 } },
    });

    const html = renderToStaticMarkup(node);
    const groups = html
      .split('<li class="fb-activity__run">')
      .slice(1)
      .map((run) => lines(run).map((line) => line.replace(/ · .*$/, '')));

    expect(groups).toEqual([
      ['user1@x.io changed Title to e1', 'user1@x.io changed Title to e2'],
      ['user2@x.io changed Title to e3'],
      ['user1@x.io changed Title to e4'],
    ]);
  });

  it('titles a related record by its useAsTitle only, formatting a date, else by id', async () => {
    const titled: NonNullable<ActivityFieldProps['req']>['payload'] = {
      collections: {
        'audit-logs': { config: { fields: [] } },
        people: {
          config: {
            admin: { useAsTitle: 'fullName' },
            fields: [{ name: 'fullName', type: 'text' }],
          },
        },
        meetings: {
          config: {
            admin: { useAsTitle: 'startsAt' },
            fields: [{ name: 'startsAt', type: 'date' }],
          },
        },
        deals: {
          config: {
            fields: [
              { name: 'owner', type: 'relationship', relationTo: 'people' },
              { name: 'meeting', type: 'relationship', relationTo: 'meetings' },
              { name: 'note', type: 'text', admin: { hidden: true } },
            ],
          },
        },
      },
      config: {},
      findByID: () => Promise.resolve({ id: 1, owner: 4, meeting: 5, note: 'x' }),
      find: (args) => {
        if (args.collection === 'audit-logs') {
          return Promise.resolve({
            docs: [
              {
                id: 'e1',
                operation: 'update',
                timestamp: '2026-01-02T00:00:00.000Z',
                changes: {
                  owner: { old: null, new: 4 },
                  meeting: { old: null, new: 5 },
                  note: { old: 'w', new: 'x' },
                },
              },
            ],
          });
        }

        return Promise.resolve({
          docs:
            args.collection === 'people'
              ? [{ id: 4, email: 'p@x.io', name: 'Pat' }]
              : [{ id: 5, startsAt: '2026-03-01T12:00:00.000Z' }],
        });
      },
    };

    const node = await ActivityField({
      collectionSlug: 'deals',
      i18n: { fallbackLanguage: 'en', language: 'en', t: (key: string) => key },
      id: 1,
      req: { payload: titled, user: { id: 1 } },
    });

    const [owner, meeting] = lines(renderToStaticMarkup(node)).map((line) =>
      line.replace(/ · .*$/, ''),
    );

    expect(owner).toBe('Someone changed Owner to #4');
    expect(meeting).toBe(
      `Someone changed Meeting to ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date('2026-03-01T12:00:00.000Z'))}`,
    );
  });

  it('names a user with no title by email, and a write with no user as Someone', async () => {
    const named: NonNullable<ActivityFieldProps['req']>['payload'] = {
      collections: {
        'audit-logs': { config: { fields: [{ name: 'user', relationTo: 'users' }] } },
        users: {
          config: { admin: { useAsTitle: 'name' }, fields: [{ name: 'name', type: 'text' }] },
        },
        deals: { config: { fields: [{ name: 'title', type: 'text' }] } },
      },
      config: {},
      findByID: () => Promise.resolve({ id: 1, title: 'x' }),
      find: () =>
        Promise.resolve({
          docs: [
            {
              id: 'e2',
              operation: 'update',
              timestamp: '2026-01-03T00:00:00.000Z',
              user: { id: 3, email: 'sam@x.io' },
              changes: { title: { old: 'w', new: 'x' } },
            },
            { id: 'e1', operation: 'create', timestamp: '2026-01-02T00:00:00.000Z', user: null },
          ],
        }),
    };

    const node = await ActivityField({
      collectionSlug: 'deals',
      id: 1,
      req: { payload: named, user: { id: 3 } },
    });

    const names = lines(renderToStaticMarkup(node)).map((line) => line.replace(/ · .*$/, ''));

    expect(names).toEqual(['Someone created this', 'sam@x.io changed Title to x']);
  });

  it('does not look up related ids that only a create entry mentions', async () => {
    const lookups: unknown[] = [];
    const created: NonNullable<ActivityFieldProps['req']>['payload'] = {
      collections: {
        'audit-logs': { config: { fields: [] } },
        companies: { config: { admin: { useAsTitle: 'name' }, fields: [] } },
        deals: {
          config: { fields: [{ name: 'company', type: 'relationship', relationTo: 'companies' }] },
        },
      },
      config: {},
      findByID: () => Promise.resolve({ id: 1, company: 8 }),
      find: (args) => {
        if (args.collection === 'audit-logs') {
          return Promise.resolve({
            docs: [
              {
                id: 'e2',
                operation: 'update',
                timestamp: '2026-01-03T00:00:00.000Z',
                changes: { company: { old: null, new: 8 } },
              },
              {
                id: 'e1',
                operation: 'create',
                timestamp: '2026-01-02T00:00:00.000Z',
                changes: { company: { old: null, new: 7 } },
              },
            ],
          });
        }

        lookups.push((args.where as { id: { in: unknown } }).id.in);

        return Promise.resolve({ docs: [{ id: 8, name: 'Acme' }] });
      },
    };

    await ActivityField({
      collectionSlug: 'deals',
      id: 1,
      req: { payload: created, user: { id: 1 } },
    });

    expect(lookups).toEqual([[8]]);
  });

  it('drops its heading when it is the only field in a tab, and keeps it anywhere else', async () => {
    const fieldSchemaMap = new Map<string, unknown>([
      [
        'tickets._index-1-0',
        { type: 'tab', label: 'Activity', fields: [{ name: 'activity', type: 'ui' }] },
      ],
    ]);

    const render = async (schemaPath: string) =>
      renderToStaticMarkup(
        await ActivityField({
          collectionSlug: 'tickets',
          fieldSchemaMap,
          id: 1,
          req: { payload, user: { id: 1 } },
          schemaPath,
        }),
      );

    expect(await render('tickets._index-1-0.activity')).not.toContain('fb-panel-section__heading');
    expect(await render('tickets.activity')).toContain('>Activity</h3>');
  });
});
