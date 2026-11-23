import { render, screen, within } from '@testing-library/react';
import type { WidgetServerProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { CollectionQueryWidget } from '../../../../../packages/ui/src/admin/widgets/CollectionQuery/index.js';

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

  it('says so when nothing matches', async () => {
    render(
      await CollectionQueryWidget(
        props({ relatedCollection: 'deals' }, vi.fn().mockResolvedValue({ docs: [] })),
      ),
    );

    expect(screen.getByText('general:nothingFound')).toBeTruthy();
  });
});
