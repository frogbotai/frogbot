import { describe, expect, it, vi } from 'vitest';

import type { FrogbotSanitizedConfig } from 'frogbot';

const mocks = vi.hoisted(() => ({
  handlerBuilder: vi.fn((config: unknown) => config),
}));

vi.mock('@payloadcms/next/routes', () => ({
  REST_DELETE: mocks.handlerBuilder,
  REST_GET: mocks.handlerBuilder,
  REST_OPTIONS: mocks.handlerBuilder,
  REST_PATCH: mocks.handlerBuilder,
  REST_POST: mocks.handlerBuilder,
  REST_PUT: mocks.handlerBuilder,
}));

const routes = await import('./routes.js');

function makeConfig() {
  const payloadConfig = { collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogbotSanitizedConfig;
  return { config, payloadConfig };
}

describe('@frogbotai/next routes', () => {
  it.each(['REST_DELETE', 'REST_GET', 'REST_OPTIONS', 'REST_PATCH', 'REST_POST', 'REST_PUT'] as const)(
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
});
