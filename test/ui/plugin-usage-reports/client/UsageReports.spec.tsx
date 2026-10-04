import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UsageReports } from '../../../../packages/plugins/plugin-usage-reports/src/client/UsageReports.js';

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({
    config: { routes: { admin: '/admin', api: '/api' } },
  }),
}));

vi.mock('@frogbotai/next/client', async () => {
  const { formatCostUSD } =
    await import('../../../../packages/next/src/elements/CostUSD/index.client.js');

  return { formatCostUSD };
});

const modelRows = [
  {
    key: 'small',
    label: 'Small',
    requestCount: 1,
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 2,
    costUSD: 0.1,
  },
  {
    key: 'large',
    label: 'Large',
    requestCount: 2,
    inputTokens: 6,
    outputTokens: 4,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 10,
    costUSD: 0.5,
  },
];

describe('UsageReports', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the Firmware models/users and date range slice', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          groupBy: 'model',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
          rows: modelRows,
          totals: {
            requestCount: 3,
            inputTokens: 7,
            outputTokens: 5,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            totalTokens: 12,
            costUSD: 0.6,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    render(<UsageReports />);

    expect(screen.getByRole('heading', { name: 'Usage Analytics' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Large')).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/usage/report?groupBy=model'),
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('groupBy=user'),
        expect.any(Object),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
  });

  it('shows sub-cent row costs and the totals in the shared cost format', async () => {
    const costRows = [
      { ...modelRows[0], costUSD: 0.0034 },
      { ...modelRows[1], costUSD: 0.5 },
    ];

    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          groupBy: 'model',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
          rows: costRows,
          totals: {
            requestCount: 3,
            inputTokens: 7,
            outputTokens: 5,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            totalTokens: 12,
            costUSD: 0.5034,
          },
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal('fetch', fetch);

    const { container } = render(<UsageReports />);

    await waitFor(() => expect(screen.getByText('Large')).toBeTruthy());

    expect(screen.getByText('Small').closest('tr')?.textContent).toContain('$0.0034');
    expect(screen.getByText('Large').closest('tr')?.textContent).toContain('$0.50');
    expect(container.querySelector('.usage-reports__totals')?.textContent).toContain('$0.50 cost');
  });
});
