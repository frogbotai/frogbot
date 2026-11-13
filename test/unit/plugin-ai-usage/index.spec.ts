import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import type { FrogBotConfig, FrogBotRequest, Plugin } from 'frogbot';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import {
  aiUsagePlugin,
  type UsageReport,
} from '../../../packages/plugins/plugin-ai-usage/src/index.js';

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
  } as FrogBotConfig;
}

async function setup() {
  const result = await aiUsagePlugin()(createConfig());
  const endpoint = result.endpoints?.find((item) => item.path === '/usage/report');
  if (!endpoint) throw new Error('Usage report endpoint missing');

  return { result, endpoint };
}

function usage(values: Partial<UsageReport['totals']>): UsageReport['totals'] {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    ...values,
  };
}

function request(
  url: string,
  aggregate: ReturnType<typeof vi.fn>,
  user: unknown = { id: 'admin', roles: ['admin'] },
) {
  return {
    url,
    user,
    frogbot: { aggregate, logger: { error: vi.fn() } },
  } as unknown as FrogBotRequest;
}

describe('aiUsagePlugin', () => {
  it('provides a typed plugin contract', () => {
    expectTypeOf(aiUsagePlugin).returns.toMatchTypeOf<Plugin>();
  });

  it('enables grouping while preserving existing usage collection admin config', async () => {
    const { result } = await setup();
    const usage = result.collections.find((item) => item.slug === 'ai-usage');

    expect(usage?.admin).toMatchObject({ group: 'AI' });
    expect(result.settings).toContainEqual({
      label: 'Usage',
      path: 'usage',
      Component: '@frogbotai/plugin-ai-usage/client#UsageReports',
    });
    expect(result.admin?.components?.views).toBeUndefined();
    expect(result.admin?.components?.afterNavLinks).toBeUndefined();
  });

  it('composes with an explicitly configured import-export plugin exactly once', async () => {
    const withReports = await aiUsagePlugin()(createConfig());
    const result = await importExportPlugin({
      collections: [{ slug: 'ai-usage', import: false, export: { format: 'csv' } }],
    })(withReports);

    const usage = result.collections.find((item) => item.slug === 'ai-usage');

    expect(result.collections.map((item) => item.slug)).toContain('exports');
    expect(usage).toHaveProperty('admin.components.listMenuItems', [
      expect.objectContaining({ path: '@frogbotai/plugin-import-export/rsc#ExportListMenuItem' }),
    ]);
    expect((result.admin?.components as Record<string, unknown>).providers).toEqual([
      '@frogbotai/plugin-import-export/rsc#ImportExportProvider',
    ]);
  });

  it('rejects unauthenticated and invalid date ranges', async () => {
    const { endpoint } = await setup();
    const aggregate = vi.fn();
    const unauthorized = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        aggregate,
        null,
      ),
    );

    const invalid = await endpoint.handler(
      request('http://localhost/api/usage/report?groupBy=model&from=nope&to=2026-02-01', aggregate),
    );

    const unsupported = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=provider&from=2026-01-01&to=2026-02-01',
        aggregate,
      ),
    );

    expect(unauthorized.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(unsupported.status).toBe(400);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('allows any authenticated caller by default, including API-key requests', async () => {
    const { endpoint } = await setup();
    const url = 'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01';
    const aggregate = vi.fn().mockResolvedValue({ groups: [] });

    expect((await endpoint.handler(request(url, aggregate, { id: 'member-1' }))).status).toBe(200);
    expect(
      (await endpoint.handler(request(url, aggregate, { id: 'service-1', _strategy: 'api-key' })))
        .status,
    ).toBe(200);
  });

  it('applies a custom access function as a gate and as a row filter', async () => {
    const denied = await aiUsagePlugin({ access: () => false })(createConfig());
    const scoped = await aiUsagePlugin({
      access: ({ req }) => ({ user: { equals: req.user!.id } }),
    })(createConfig());

    const url = 'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01';
    const aggregate = vi.fn().mockResolvedValue({ groups: [] });

    const forbidden = await denied
      .endpoints!.find((item) => item.path === '/usage/report')!
      .handler(request(url, aggregate));

    expect(forbidden.status).toBe(403);
    expect(aggregate).not.toHaveBeenCalled();

    await scoped
      .endpoints!.find((item) => item.path === '/usage/report')!
      .handler(request(url, aggregate, { id: 'user-1' }));

    expect(aggregate.mock.calls[0][0].where.and).toContainEqual({ user: { equals: 'user-1' } });
  });

  it('rejects apiKey grouping until a plugin adds the relationship', async () => {
    const config = createConfig();
    const usage = config.collections.find((item) => item.slug === 'ai-usage')!;
    usage.fields = usage.fields.filter((field) => !('name' in field && field.name === 'apiKey'));
    const result = await aiUsagePlugin()(config);
    const aggregate = vi.fn();

    const response = await result
      .endpoints!.find((item) => item.path === '/usage/report')!
      .handler(
        request(
          'http://localhost/api/usage/report?groupBy=apiKey&from=2026-01-01&to=2026-02-01',
          aggregate,
        ),
      );

    expect(response.status).toBe(400);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each([
    ['before', (keys: Plugin, reports: Plugin) => [reports, keys]],
    ['after', (keys: Plugin, reports: Plugin) => [keys, reports]],
  ])('accepts apiKey grouping when listed %s the API keys plugin', async (_name, list) => {
    let seen: FrogBotConfig | undefined;
    const spy: Plugin = Object.assign(
      (input: FrogBotConfig) => {
        seen = input;

        return input;
      },
      { order: 1000 },
    );

    await buildConfig({
      secret: 'secret',
      db: {} as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ai: { providers: { openai: { apiKey: 'test' } } },
      plugins: [...list(apiKeysPlugin(), aiUsagePlugin()), spy],
    });

    const usage = seen!.collections.find((item) => item.slug === 'usage-logs');
    const endpoint = seen!.endpoints?.find((item) => item.path === '/usage/report');
    const aggregate = vi.fn().mockResolvedValue({ groups: [] });
    const response = await endpoint!.handler(
      request(
        'http://localhost/api/usage/report?groupBy=apiKey&from=2026-01-01&to=2026-02-01',
        aggregate,
      ),
    );

    expect(usage?.fields.map((field) => ('name' in field ? field.name : undefined))).toContain(
      'apiKey',
    );
    expect(response.status).toBe(200);
  });

  it('totals model usage with one aggregate call', async () => {
    const aggregate = vi.fn().mockResolvedValue({
      groups: [
        {
          group: { model: 'openai/b' },
          values: usage({
            requestCount: 1,
            inputTokens: 3,
            outputTokens: 4,
            totalTokens: 7,
            costUSD: 0.1,
          }),
        },
        {
          group: { model: 'openai/a' },
          values: usage({
            requestCount: 2,
            inputTokens: 12,
            outputTokens: 6,
            cachedInputTokens: 2,
            reasoningTokens: 1,
            totalTokens: 21,
            costUSD: 0.25,
          }),
        },
      ],
    });

    const { endpoint } = await setup();
    const response = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        aggregate,
      ),
    );

    const body = await response.json();

    expect(aggregate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        collection: 'ai-usage',
        groupBy: 'model',
        values: {
          requestCount: { count: true },
          inputTokens: { sum: 'inputTokens' },
          outputTokens: { sum: 'outputTokens' },
          cachedInputTokens: { sum: 'cachedInputTokens' },
          cacheWriteTokens: { sum: 'cacheWriteTokens' },
          reasoningTokens: { sum: 'reasoningTokens' },
          totalTokens: { sum: 'totalTokens' },
          costUSD: { sum: 'costUSD' },
        },
        where: {
          and: [
            { requestedAt: { greater_than_equal: '2026-01-01T00:00:00.000Z' } },
            { requestedAt: { less_than_equal: '2026-02-01T00:00:00.000Z' } },
          ],
        },
        depth: 1,
        overrideAccess: true,
      }),
    );
    expect(aggregate.mock.calls[0][0]).not.toHaveProperty('limit');
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
    expect(body.totals).toMatchObject({ requestCount: 3, inputTokens: 15, totalTokens: 28 });
  });

  it('folds missing and empty models into one unknown row', async () => {
    const aggregate = vi.fn().mockResolvedValue({
      groups: [
        {
          group: { model: null },
          values: usage({ requestCount: 1, totalTokens: 2, costUSD: 0.5 }),
        },
        { group: { model: '' }, values: usage({ requestCount: 2, totalTokens: 3, costUSD: 0.25 }) },
      ],
    });

    const { endpoint } = await setup();
    const response = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        aggregate,
      ),
    );

    expect((await response.json()).rows).toEqual([
      expect.objectContaining({
        key: 'unknown',
        label: 'unknown',
        requestCount: 3,
        totalTokens: 5,
        costUSD: 0.75,
      }),
    ]);
  });

  it('groups populated users, attributed API keys, and UTC days', async () => {
    const values = usage({ requestCount: 2, totalTokens: 10, costUSD: 1 });
    const { endpoint } = await setup();

    for (const [groupBy, path, key, label, expected] of [
      ['user', 'user', { id: 'u1', email: 'one@example.com' }, 'one@example.com', 'user'],
      ['apiKey', 'apiKey', { id: 'k1', name: 'Production' }, 'Production', 'apiKey'],
      [
        'day',
        'requestedAt',
        '2026-01-02T00:00:00.000Z',
        '2026-01-02',
        { field: 'requestedAt', by: 'day' },
      ],
    ] as const) {
      const aggregate = vi.fn().mockResolvedValue({
        groups: [
          { group: { [path]: key }, values },
          { group: { [path]: null }, values: usage({ requestCount: 5 }) },
        ],
      });

      const response = await endpoint.handler(
        request(
          `http://localhost/api/usage/report?groupBy=${groupBy}&from=2026-01-01&to=2026-02-01`,
          aggregate,
        ),
      );

      const body = await response.json();

      expect(aggregate.mock.calls[0][0].groupBy).toEqual(expected);
      expect(body.rows).toEqual([
        expect.objectContaining({
          key: typeof key === 'string' ? '2026-01-02' : key.id,
          label,
          requestCount: 2,
          totalTokens: 10,
          costUSD: 1,
        }),
      ]);
    }
  });

  it('keeps an unpopulated relationship ID as its own label', async () => {
    const aggregate = vi.fn().mockResolvedValue({
      groups: [{ group: { user: 7 }, values: usage({ requestCount: 1 }) }],
    });

    const { endpoint } = await setup();
    const response = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=user&from=2026-01-01&to=2026-02-01',
        aggregate,
      ),
    );

    expect((await response.json()).rows).toEqual([
      expect.objectContaining({ key: '7', label: '7', requestCount: 1 }),
    ]);
  });

  it('returns an empty report for an empty range', async () => {
    const aggregate = vi.fn().mockResolvedValue({ groups: [] });
    const { endpoint } = await setup();
    const response = await endpoint.handler(
      request(
        'http://localhost/api/usage/report?groupBy=model&from=2026-01-01&to=2026-02-01',
        aggregate,
      ),
    );

    expect(await response.json()).toMatchObject({
      rows: [],
      totals: { requestCount: 0, totalTokens: 0, costUSD: 0 },
    });
  });
});

describe('usage retention', () => {
  type Task = NonNullable<NonNullable<FrogBotConfig['jobs']>['tasks']>[number];

  async function pruneTask(
    options: Parameters<typeof aiUsagePlugin>[0],
    config = createConfig(),
  ): Promise<Task | undefined> {
    return (await aiUsagePlugin(options)(config)).jobs?.tasks?.at(-1);
  }

  async function run(task: Task | undefined, req: object): Promise<void> {
    const handler = task?.handler;

    if (typeof handler !== 'function') throw new Error('Expected an inline task handler.');

    await handler({ req } as unknown as Parameters<typeof handler>[0]);
  }

  it('registers no task by default', async () => {
    expect(await pruneTask({})).toBeUndefined();
    expect(await pruneTask({ retention: false })).toBeUndefined();
  });

  it('schedules on the default queue at midnight for the resolved usage collection', async () => {
    const task = await pruneTask({ retention: { days: 30 } });

    expect(task?.slug).toBe('frogbot-prune-ai-usage');
    expect(task?.schedule).toEqual([{ cron: '0 0 * * *', queue: 'default' }]);
  });

  it('falls back to usage-logs when no usage collection is configured', async () => {
    const config = createConfig();
    config.collections = config.collections.filter((collection) => !collection.usageLog);

    expect((await pruneTask({ retention: { days: 30 } }, config))?.slug).toBe(
      'frogbot-prune-usage-logs',
    );
  });

  it('keeps a custom cron', async () => {
    expect((await pruneTask({ retention: { days: 30, cron: '0 4 * * *' } }))?.schedule).toEqual([
      { cron: '0 4 * * *', queue: 'default' },
    ]);
  });

  it.each([0, 1.5])('rejects retention.days of %s', (days) => {
    expect(() => aiUsagePlugin({ retention: { days } })).toThrow(
      '[plugin-ai-usage] retention.days must be a positive integer.',
    );
  });

  it('deletes expired rows in batches by id', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ docs: [] });

    const remove = vi.fn().mockResolvedValue({ docs: [], errors: [] });

    await run(await pruneTask({ retention: { days: 30 } }), { frogbot: { find, delete: remove } });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'ai-usage',
        where: { requestedAt: { less_than: expect.any(String) } },
        limit: 100,
        sort: 'requestedAt',
        depth: 0,
        overrideAccess: true,
      }),
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ collection: 'ai-usage', where: { id: { in: [1, 2] } } }),
    );
  });

  it('fails the prune when a batch delete reports errors', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 1 }] });
    const remove = vi
      .fn()
      .mockResolvedValue({ docs: [], errors: [{ id: 1, message: 'delete refused' }] });

    await expect(
      run(await pruneTask({ retention: { days: 30 } }), { frogbot: { find, delete: remove } }),
    ).rejects.toThrow('delete refused');
    expect(find).toHaveBeenCalledTimes(1);
  });
});
