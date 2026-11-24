import { fireEvent, render, screen, within } from '@testing-library/react';
import type { WidgetServerProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { CollectionQueryWidget } from '../../../../../packages/ui/src/admin/widgets/CollectionQuery/index.js';

vi.mock('@payloadcms/ui', () => ({
  toast: { error: vi.fn() },
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
}));

vi.mock('@payloadcms/ui/rsc', () => ({
  CollectionQueryWidget: () => <p>Payload widget</p>,
}));

const deals = {
  admin: { useAsTitle: 'name' },
  custom: {
    frogbot: {
      collectionViews: [
        { slug: 'list', type: 'list', defaultFields: ['name', 'stage', 'amount', 'closeDate'] },
      ],
    },
  },
  flattenedFields: [
    { name: 'name', type: 'text' },
    {
      name: 'stage',
      type: 'select',
      options: [{ label: 'Proposal', value: 'proposal' }],
      admin: { custom: { frogbot: { optionColors: { proposal: 'purple' } } } },
    },
    {
      name: 'amount',
      type: 'number',
      admin: { custom: { frogbot: { kind: { type: 'money', currency: 'USD' } } } },
    },
    { name: 'closeDate', type: 'date' },
    { name: 'lineItems', type: 'array' },
    { name: 'notes', type: 'richText' },
  ],
  labels: { plural: 'Deals', singular: 'Deal' },
};

function props(data: Record<string, unknown>, find = vi.fn()) {
  return {
    req: {
      i18n: {
        language: 'en-US',
        t: (key: string, vars?: { label?: string }) =>
          key === 'general:showAllLabel' ? `Show all ${vars?.label}` : key,
      },
      payload: {
        collections: { deals: { config: deals } },
        config: { routes: { admin: '/admin' } },
        find,
      },
      user: { id: 1 },
    },
    widgetData: data,
  } as unknown as WidgetServerProps<{ data?: Record<string, unknown> }>;
}

describe('CollectionQueryWidget', () => {
  it('shows each record with its stage, amount and due date', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        {
          id: 7,
          name: 'Lumen Labs renewal',
          stage: 'proposal',
          amount: 48000,
          closeDate: '2020-01-02',
        },
      ],
    });

    render(
      await CollectionQueryWidget(
        props(
          {
            relatedCollection: 'deals',
            sortDirection: 'asc',
            sortField: 'closeDate',
            title: 'Closing soon',
            where: { stage: { not_in: ['won'] } },
          },
          find,
        ),
      ),
    );

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'deals',
        limit: 5,
        overrideAccess: false,
        sort: 'closeDate',
      }),
    );
    expect(screen.getByRole('heading', { name: 'Closing soon' })).toBeTruthy();

    const row = screen.getByRole('listitem');

    expect(within(row).getByRole('link', { name: 'Lumen Labs renewal' }).getAttribute('href')).toBe(
      '/admin/collections/deals/7',
    );
    expect(within(row).getByText('Proposal').className).toContain('fb-option-pill--purple');
    expect(within(row).getByText('$48,000')).toBeTruthy();
    expect(row.querySelector('time')?.className).toContain('fb-query-widget__date--overdue');

    const all = screen.getByRole('link', { name: 'Show all Deals' }).getAttribute('href') ?? '';

    expect(decodeURIComponent(all)).toContain(
      '/admin/collections/deals?sort=closeDate&where[stage][not_in][0]=won',
    );
  });

  it('falls back to Payload’s widget, which explains the mistake, for a bad sort field or query', async () => {
    render(await CollectionQueryWidget(props({ relatedCollection: 'deals', sortField: 'nope' })));

    expect(screen.getByText('Payload widget')).toBeTruthy();

    const failing = vi.fn().mockRejectedValue(new Error('The following path cannot be queried'));

    render(
      await CollectionQueryWidget(
        props({ relatedCollection: 'deals', where: { x: { equals: 1 } } }, failing),
      ),
    );

    expect(screen.getAllByText('Payload widget')).toHaveLength(2);
  });

  it('shows the value a list is sorted by, and no made-up date for a text sort', async () => {
    const doc = {
      id: 7,
      name: 'Acme 2',
      stage: 'proposal',
      amount: 48000,
      closeDate: '2020-01-02',
    };

    const find = () => vi.fn().mockResolvedValue({ docs: [doc] });

    const { unmount } = render(
      await CollectionQueryWidget(
        props({ relatedCollection: 'deals', sortField: 'amount' }, find()),
      ),
    );

    expect(within(screen.getByRole('listitem')).getByText('$48,000')).toBeTruthy();
    expect(screen.getByRole('listitem').querySelector('time')).toBeNull();

    unmount();

    render(
      await CollectionQueryWidget(props({ relatedCollection: 'deals', sortField: 'name' }, find())),
    );

    expect(screen.getByRole('listitem').querySelector('time')).toBeNull();
  });

  it.each(['lineItems', 'notes'])(
    'falls back to Payload’s widget for the non-sortable sort field %s',
    async (sortField) => {
      render(await CollectionQueryWidget(props({ relatedCollection: 'deals', sortField })));

      expect(screen.getByText('Payload widget')).toBeTruthy();
    },
  );

  it('gives task rows a check circle that marks the task done', async () => {
    const tasks = {
      ...deals,
      access: { update: vi.fn().mockResolvedValue(true) },
      admin: { custom: { frogbot: { useAsDone: 'completed' } }, useAsTitle: 'name' },
    };

    const base = props(
      { relatedCollection: 'tasks' },
      vi.fn().mockResolvedValue({
        docs: [{ id: 3, name: 'Write the pricing FAQ', completed: false }],
      }),
    );

    Object.assign(base.req.payload.collections, { tasks: { config: tasks } });

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ doc: { id: 3, completed: true } }), { status: 200 }),
      );

    vi.stubGlobal('fetch', fetchMock);
    render(await CollectionQueryWidget(base));

    const check = screen.getByRole('button', { name: 'Mark complete' });

    fireEvent.click(check);

    expect(await screen.findByRole('button', { name: 'Completed' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/3'),
      expect.objectContaining({ body: JSON.stringify({ completed: true }), method: 'PATCH' }),
    );

    vi.unstubAllGlobals();
  });

  it('shows the check circle read-only without update access', async () => {
    const tasks = {
      ...deals,
      access: { update: vi.fn().mockResolvedValue(false) },
      admin: { custom: { frogbot: { useAsDone: 'completed' } }, useAsTitle: 'name' },
    };

    const base = props(
      { relatedCollection: 'tasks' },
      vi.fn().mockResolvedValue({
        docs: [{ id: 3, name: 'Write the pricing FAQ', completed: false }],
      }),
    );

    Object.assign(base.req.payload.collections, { tasks: { config: tasks } });
    render(await CollectionQueryWidget(base));

    expect(screen.getByRole('button', { name: 'Mark complete' })).toHaveProperty('disabled', true);
  });

  it('says so when nothing matches', async () => {
    render(
      await CollectionQueryWidget(
        props({ relatedCollection: 'deals' }, vi.fn().mockResolvedValue({ docs: [] })),
      ),
    );

    expect(screen.getByText('general:nothingFound')).toBeTruthy();
  });
});
