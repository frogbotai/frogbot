import { importExportPlugin } from '@frogbotai/plugin-import-export';
import type { FrogbotConfig, FrogbotRequest, Plugin } from 'frogbot';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { usageReportsPlugin } from './index.js';

function createConfig() {
  return {
    secret: 'test',
    db: {},
    collections: [
      { slug: 'users', auth: true, fields: [] },
      {
        slug: 'ai-usage',
        usageLog: true,
        admin: { group: 'AI' },
        fields: [
          { name: 'user', type: 'relationship', relationTo: 'users' },
          { name: 'apiKey', type: 'relationship', relationTo: 'api-keys' },
        ],
      },
    ],
    ai: { providers: { openai: { apiKey: 'test' } } },
  } as FrogbotConfig;
}

async function setup(pageSize = 2) {
  const result = await usageReportsPlugin({ pageSize })(createConfig());
  const endpoint = result.endpoints?.find((item) => item.path === '/usage/report');
  if (!endpoint) throw new Error('Usage report endpoint missing');
  return { result, endpoint };
}

function request(
  url: string,
  find: ReturnType<typeof vi.fn>,
  user: unknown = { id: 'admin', roles: ['admin'] },
) {
  return {
    url,
    user,
    frogbot: { find, logger: { error: vi.fn() } },
  } as unknown as FrogbotRequest;
}

describe('usageReportsPlugin', () => {
  it('provides a typed plugin contract', () => {
    expectTypeOf(usageReportsPlugin).returns.toMatchTypeOf<Plugin>();
  });

  it('enables grouping while preserving existing usage collection admin config', async () => {
    const { result } = await setup();
    const usage = result.collections.find((item) => item.slug === 'ai-usage');
    expect(usage?.admin).toMatchObject({ group: 'AI', groupBy: true });
    expect((result.admin?.components as Record<string, unknown>).views).toMatchObject({
      usageReports: { path: '/usage-analytics' },
    });
    expect((result.admin?.components as Record<string, unknown>).afterNavLinks).toContain(
      '@frogbotai/plugin-usage-reports/client#UsageReportsNavLink',
    );
  });

  it('composes with an explicitly configured import-export plugin exactly once', async () => {
    const withReports = await usageReportsPlugin()(createConfig());
    const result = (await importExportPlugin({
      collections: [{ slug: 'ai-usage', import: false, export: { format: 'csv' } }],
    })(withReports as never)) as unknown as typeof withReports;
    const usage = result.collections.find((item) => item.slug === 'ai-usage');

    expect(result.collections.map((item) => item.slug)).toContain('exports');
    expect(usage?.admin?.components?.listMenuItems).toEqual([
      expect.objectContaining({ path: '@payloadcms/plugin-import-export/rsc#ExportListMenuItem' }),
    ]);
    expect((result.admin?.components as Record<string, unknown>).providers).toEqual([
      '@payloadcms/plugin-import-export/rsc#ImportExportProvider',
    ]);
  });

  it('rejects unauthenticated and invalid date ranges', async () => {
    const { endpoint } = await setup();
    const find = vi.fn();
    const unauthorized = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        find,
        null,
      ),
    );
    const invalid = await endpoint.handler(
      request('http://localhost/api/usage/report?groupBy=model&from=nope&to=2026-02-01', find),
    );
    const unsupported = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=provider&from=2026-01-01&to=2026-02-01',
        find,
      ),
    );
    expect(unauthorized.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(unsupported.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  it('allows any authenticated caller by default, including API-key requests', async () => {
    const { endpoint } = await setup();
    const url = 'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01';
    const find = vi.fn().mockResolvedValue({ docs: [], hasNextPage: false });

    expect((await endpoint.handler(request(url, find, { id: 'member-1' }))).status).toBe(200);
    expect(
      (await endpoint.handler(request(url, find, { id: 'service-1', _strategy: 'api-key' })))
        .status,
    ).toBe(200);
  });

  it('applies a custom access function as a gate and as a row filter', async () => {
    const denied = await usageReportsPlugin({ access: () => false })(createConfig());
    const scoped = await usageReportsPlugin({
      access: ({ req }) => ({ user: { equals: req.user!.id } }),
    })(createConfig());
    const url = 'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01';
    const find = vi.fn().mockResolvedValue({ docs: [], hasNextPage: false });

    const forbidden = await denied
      .endpoints!.find((item) => item.path === '/usage/report')!
      .handler(request(url, find));
    expect(forbidden.status).toBe(403);
    expect(find).not.toHaveBeenCalled();

    await scoped
      .endpoints!.find((item) => item.path === '/usage/report')!
      .handler(request(url, find, { id: 'user-1' }));
    expect(find.mock.calls[0][0].where.and).toContainEqual({ user: { equals: 'user-1' } });
  });

  it('rejects apiKey grouping until a plugin adds the relationship', async () => {
    const config = createConfig();
    const usage = config.collections.find((item) => item.slug === 'ai-usage')!;
    usage.fields = usage.fields.filter((field) => !('name' in field && field.name === 'apiKey'));
    const result = await usageReportsPlugin()(config);
    const find = vi.fn();

    const response = await result
      .endpoints!.find((item) => item.path === '/usage/report')!
      .handler(
        request(
          'http://localhost/api/usage/report?groupBy=apiKey&from=2026-01-01&to=2026-02-01',
          find,
        ),
      );

    expect(response.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  it('paginates the resolved collection and aggregates model usage', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [
          {
            model: 'openai/a',
            inputTokens: 10,
            outputTokens: 5,
            cachedInputTokens: 2,
            reasoningTokens: 1,
            totalTokens: 18,
            costUSD: 0.2,
          },
          { model: 'openai/b', inputTokens: 3, outputTokens: 4, totalTokens: 7, costUSD: 0.1 },
        ],
        hasNextPage: true,
        nextPage: 2,
      })
      .mockResolvedValueOnce({
        docs: [
          { model: 'openai/a', inputTokens: 2, outputTokens: 1, totalTokens: 3, costUSD: 0.05 },
        ],
        hasNextPage: false,
      });
    const { endpoint } = await setup();
    const response = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        find,
      ),
    );
    const body = await response.json();
    expect(find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ collection: 'ai-usage', page: 1, limit: 2, depth: 1 }),
    );
    expect(find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: 'ai-usage', page: 2 }),
    );
    expect(body.rows).toEqual([
      expect.objectContaining({
        key: 'openai/a',
        requestCount: 2,
        inputTokens: 12,
        totalTokens: 21,
        costUSD: 0.25,
      }),
      expect.objectContaining({ key: 'openai/b', requestCount: 1, totalTokens: 7, costUSD: 0.1 }),
    ]);
  });

  it('groups populated users, attributed API keys, and UTC days', async () => {
    const docs = [
      {
        user: { id: 'u1', email: 'one@example.com' },
        apiKey: { id: 'k1', name: 'Production' },
        requestedAt: '2026-01-02T23:30:00.000Z',
        totalTokens: 4,
        costUSD: 0.4,
      },
      {
        user: 'u1',
        apiKey: 'k1',
        requestedAt: '2026-01-02T01:00:00.000Z',
        totalTokens: 6,
        costUSD: 0.6,
      },
    ];
    const { endpoint } = await setup();
    for (const [groupBy, key] of [
      ['user', 'u1'],
      ['apiKey', 'k1'],
      ['day', '2026-01-02'],
    ] as const) {
      const find = vi.fn().mockResolvedValue({ docs, hasNextPage: false });
      const response = await endpoint.handler(
        request(
          `http://localhost/api/usage/report?groupBy=${groupBy}&from=2026-01-01&to=2026-02-01`,
          find,
        ),
      );
      const body = await response.json();
      expect(body.rows).toEqual([
        expect.objectContaining({ key, requestCount: 2, totalTokens: 10, costUSD: 1 }),
      ]);
    }
  });

  it('returns an empty report for an empty range', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [], hasNextPage: false });
    const { endpoint } = await setup();
    const response = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        find,
      ),
    );
    expect(await response.json()).toMatchObject({
      rows: [],
      totals: { requestCount: 0, totalTokens: 0, costUSD: 0 },
    });
  });
});
