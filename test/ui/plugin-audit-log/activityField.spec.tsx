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
});
