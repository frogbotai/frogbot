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
          timestamp: '2026-01-03T00:00:00.000Z',
          changes: { priority: {} },
        },
        {
          id: 'e1',
          operation: 'update',
          timestamp: '2026-01-02T00:00:00.000Z',
          changes: { summary: {} },
        },
      ],
    }),
};

describe('ActivityField', () => {
  it('names a changed field that sits in an unnamed tab or a row', async () => {
    const node = await ActivityField({
      collectionSlug: 'tickets',
      id: 1,
      req: { payload, user: { id: 1 } },
    });

    const text = renderToStaticMarkup(node).replace(/<[^>]+>/g, '|');

    expect(text).toContain('changed Priority');
    expect(text).toContain('changed Summary');
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
    expect(text).toContain('changed Dringlichkeit');
  });

  it('shows old and new values by label, and a related record it cannot read by id', async () => {
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
                timestamp: '2026-01-02T00:00:00.000Z',
                user: { id: 2, fullName: 'Ana Park', email: 'ana@example.com' },
                changes: {
                  stage: { old: 'lead', new: 'qualified' },
                  tags: { old: ['hot'], new: ['hot', 'cold'] },
                  owner: { old: 3, new: 2 },
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
    const changes = [...html.matchAll(/<li class="fb-activity__change">(.*?)<\/li>/g)].map(
      ([, text]) => text.replace(/<[^>]+>/g, ''),
    );

    expect(html).toContain(
      '<strong>Ana Park</strong> changed Stage, Tags, Owner, Party, Won, Notes',
    );
    expect(html).not.toContain('Secret');
    expect(changes).toEqual([
      'Stage Interessent → Qualified',
      'Tags hot → hot, cold',
      'Owner #3 → Ana Park',
      'Party None → Acme',
      'Won No → Yes',
    ]);
    expect(lookups).toEqual([
      { collection: 'users', where: { id: { in: [3, 2] } } },
      { collection: 'companies', where: { id: { in: [7] } } },
    ]);
  });

  it('shows a cleared text as None, adds the time to same-day dates, and skips no-op values', async () => {
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
              timestamp: '2026-01-02T00:00:00.000Z',
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

    const changes = [
      ...renderToStaticMarkup(node).matchAll(/<li class="fb-activity__change">(.*?)<\/li>/g),
    ].map(([, text]) => text.replace(/<[^>]+>/g, ''));

    expect(changes[0]).toBe('Title Q9 → None');

    const [from, to] = (changes[1] ?? '').replace('Due ', '').split(' → ');

    expect(from).not.toBe(to);
    expect(changes).toHaveLength(2);
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

    const html = renderToStaticMarkup(node);
    const changes = [...html.matchAll(/<li class="fb-activity__change">(.*?)<\/li>/g)].map(
      ([, text]) => text.replace(/<[^>]+>/g, ''),
    );

    expect(html).toContain('changed Owner, Meeting<');
    expect(changes[0]).toBe('Owner None → #4');
    expect(changes[1]).toBe(
      `Meeting None → ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date('2026-03-01T12:00:00.000Z'))}`,
    );
  });
});
