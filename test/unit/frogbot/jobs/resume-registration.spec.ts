import type * as PayloadModule from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { resetFrogBotCache } from '../../../../packages/frogbot/src/getFrogBot.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
}));

function config(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'resume-endpoint-test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ...overrides,
  };
}

afterEach(resetFrogBotCache);

describe('resume endpoint registration', () => {
  it('registers GET, HEAD and POST without changing the injected waitpoint collection', async () => {
    const sanitized = sanitize(config());

    const payloadConfig = await sanitized._internal.payloadConfig;
    const endpoints = payloadConfig.endpoints || [];
    const waitpoints = payloadConfig.collections?.filter(
      ({ slug }) => slug === 'frogbot-waitpoints',
    );

    expect(endpoints.filter(({ path }) => path === '/jobs/:token/resume')).toEqual([
      expect.objectContaining({ method: 'get', handler: expect.any(Function) }),
      expect.objectContaining({ method: 'head', handler: expect.any(Function) }),
      expect.objectContaining({ method: 'post', handler: expect.any(Function) }),
    ]);
    expect(waitpoints).toHaveLength(1);
    expect(waitpoints?.[0]).toMatchObject({ admin: { hidden: true } });
    expect(
      payloadConfig.collections?.some(({ slug }) => slug === 'frogbot-trigger-subscriptions'),
    ).toBe(true);
  });

  it('keeps resume routes ahead of broad custom routes and preserves unrelated endpoints', async () => {
    const handler = vi.fn(() => Response.json({ custom: true }));
    const sanitized = sanitize(
      config({ endpoints: [{ path: '/:prefix/:token/resume', method: 'post', handler }] }),
    );

    const payloadConfig = await sanitized._internal.payloadConfig;
    const endpoints = payloadConfig.endpoints || [];
    const resumeIndex = endpoints.findIndex(
      ({ method, path }) => method === 'post' && path === '/jobs/:token/resume',
    );
    const customIndex = endpoints.findIndex(({ path }) => path === '/:prefix/:token/resume');

    expect(resumeIndex).toBeGreaterThanOrEqual(0);
    expect(customIndex).toBeGreaterThan(resumeIndex);
    expect(endpoints.some(({ path }) => path === '/frogbot')).toBe(true);
  });

  it.each(['/jobs', '/jobs/:token/resume', '/jobs/custom'])(
    'rejects a reserved endpoint collision at %s',
    (path) => {
      expect(() =>
        sanitize(config({ endpoints: [{ path, method: 'post', handler: () => new Response() }] })),
      ).toThrow(`Endpoint path '${path}' is reserved for the jobs API`);
    },
  );

  it('rejects a jobs collection that would intercept the root routes', () => {
    expect(() => sanitize(config({ collections: [{ slug: 'jobs', fields: [] }] }))).toThrow(
      "Collection slug 'jobs' is reserved for the jobs API",
    );
  });

  it('passes the original request through the sanitized handler to a read-only lookup', async () => {
    const sanitized = sanitize(config({ routes: { api: '/custom-api' } }));
    const payloadConfig = await sanitized._internal.payloadConfig;
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const payload = { db: { find } };
    const frogbot = {} as FrogBot;

    registerFrogBotInstance(payload, frogbot, sanitized);

    const req = Object.assign(new Request('https://example.com/custom-api/jobs/secret/resume'), {
      payload,
      context: {},
      routeParams: { token: 'secret' },
    });
    const endpoint = (payloadConfig.endpoints || []).find(
      ({ path, method }) => path === '/jobs/:token/resume' && method === 'get',
    )!;

    const response = await endpoint.handler(req as never);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Link not found');
    expect(req).toHaveProperty('frogbot', frogbot);
    expect(find).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        collection: 'frogbot-waitpoints',
        req,
        where: { token: { equals: 'secret' } },
      }),
    );
  });
});
