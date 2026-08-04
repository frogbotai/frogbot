import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UsageReports } from './UsageReports.js';

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { admin: '/admin', api: '/api' } } }),
}));

const modelRows = [
  { key: 'small', label: 'Small', requestCount: 1, inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 2, costUSD: 0.1 },
  { key: 'large', label: 'Large', requestCount: 2, inputTokens: 6, outputTokens: 4, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 10, costUSD: 0.5 },
];

describe('UsageReports', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the Firmware models/users and date range slice', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      groupBy: 'model',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      rows: modelRows,
      totals: { requestCount: 3, inputTokens: 7, outputTokens: 5, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 12, costUSD: 0.6 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    render(<UsageReports />);

    expect(screen.getByRole('heading', { name: 'Usage Analytics' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Large')).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/usage/report?groupBy=model'), expect.any(Object));

    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('groupBy=user'), expect.any(Object)));

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
  });
});
