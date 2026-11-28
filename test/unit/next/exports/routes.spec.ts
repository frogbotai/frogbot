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

  it.each(['REST_GET', 'REST_POST', 'GRAPHQL_POST'] as const)(
    '%s leaves the config endpoints unchanged',
    async (name) => {
      const { config, payloadConfig } = makeConfig();

      routes[name](config);
      await mocks.handlerBuilder.mock.lastCall?.[0];

      expect(payloadConfig.endpoints).toEqual([]);
    },
  );

  it("rewrites Payload's unknown-route 404 as a route.not-found Problem, and passes the rest through", async () => {
    const { config } = makeConfig();
    const notFound = Response.json(
      { message: 'Route not found "/api/nope"' },
      { status: 404, headers: { 'access-control-allow-origin': '*' } },
    );

    const found = Response.json({ docs: [] });

    mocks.handlerBuilder.mockImplementationOnce(() => () => Promise.resolve(notFound));

    const unknown = await (
      routes.REST_GET(config) as unknown as (request: Request, args: unknown) => Promise<Response>
    )(new Request('http://localhost/api/nope'), {});

    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('content-type')).toContain('application/problem+json');
    expect(unknown.headers.get('access-control-allow-origin')).toBe('*');
    expect(await unknown.json()).toMatchObject({
      code: 'route.not-found',
      detail: 'No GET route at /api/nope.',
    });

    mocks.handlerBuilder.mockImplementationOnce(() => () => Promise.resolve(found));

    const listed = await (
      routes.REST_GET(config) as unknown as (request: Request, args: unknown) => Promise<Response>
    )(new Request('http://localhost/api/posts'), {});

    expect(listed).toBe(found);
  });
});
