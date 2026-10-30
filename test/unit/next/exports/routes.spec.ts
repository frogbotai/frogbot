import type { FrogBotSanitizedConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlerBuilder: vi.fn((config: unknown) => config),
}));

vi.mock('@payloadcms/next/routes', () => ({
  GRAPHQL_PLAYGROUND_GET: mocks.handlerBuilder,
  GRAPHQL_POST: mocks.handlerBuilder,
  REST_DELETE: mocks.handlerBuilder,
  REST_GET: mocks.handlerBuilder,
  REST_OPTIONS: mocks.handlerBuilder,
  REST_PATCH: mocks.handlerBuilder,
  REST_POST: mocks.handlerBuilder,
  REST_PUT: mocks.handlerBuilder,
}));

const routes = await import('../../../../packages/next/src/exports/routes.js');

function makeConfig(endpoints: Array<Record<string, unknown>> = []) {
  const payloadConfig = { collections: [], endpoints };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogBotSanitizedConfig;

  return { config, payloadConfig };
}

describe('@frogbotai/next routes', () => {
  it.each([
    'REST_DELETE',
    'REST_GET',
    'REST_OPTIONS',
    'REST_PATCH',
    'REST_POST',
    'REST_PUT',
    'GRAPHQL_POST',
    'GRAPHQL_PLAYGROUND_GET',
  ] as const)(
    '%s passes the unwrapped payload config promise to the payload handler builder',
    async (name) => {
      const { config, payloadConfig } = makeConfig();

      routes[name](config);

      expect(mocks.handlerBuilder).toHaveBeenCalled();
      await expect(mocks.handlerBuilder.mock.lastCall?.[0]).resolves.toBe(payloadConfig);
    },
  );

  it('accepts a promise of the frogbot config', async () => {
    const { config, payloadConfig } = makeConfig();

    routes.REST_GET(Promise.resolve(config));

    await expect(mocks.handlerBuilder.mock.lastCall?.[0]).resolves.toBe(payloadConfig);
  });

  it('REST handlers add the app-icon endpoints once', async () => {
    const { config, payloadConfig } = makeConfig();

    routes.REST_GET(config);
    await mocks.handlerBuilder.mock.lastCall?.[0];
    routes.REST_POST(config);
    await mocks.handlerBuilder.mock.lastCall?.[0];

    expect(payloadConfig.endpoints.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'get /frogbot/app-icon/:size',
      'get /frogbot/app-manifest',
    ]);
  });

  it('REST handlers leave an endpoint already on an app-icon path alone', async () => {
    const handler = () => new Response();
    const { config, payloadConfig } = makeConfig([
      { handler, method: 'get', path: '/frogbot/app-manifest' },
    ]);

    routes.REST_GET(config);
    await mocks.handlerBuilder.mock.lastCall?.[0];

    expect(payloadConfig.endpoints).toHaveLength(2);
    expect(payloadConfig.endpoints[0]).toMatchObject({ handler, path: '/frogbot/app-manifest' });
    expect(payloadConfig.endpoints[1]).toMatchObject({ path: '/frogbot/app-icon/:size' });
  });

  it('GraphQL handlers add no endpoints', async () => {
    const { config, payloadConfig } = makeConfig();

    routes.GRAPHQL_POST(config);
    await mocks.handlerBuilder.mock.lastCall?.[0];

    expect(payloadConfig.endpoints).toEqual([]);
  });
});
