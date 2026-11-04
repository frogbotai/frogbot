import type { CollectionConfig, FrogBot, FrogBotConfig, OnInit } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import {
  clientIp,
  resolveSpamOptions,
  takeRateLimit,
} from '../../../packages/plugins/plugin-forms/src/spam.js';

const leads: CollectionConfig = {
  slug: 'leads',
  fields: [{ name: 'email', type: 'email', required: true }],
};

function config(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return { secret: 'test', db: {}, collections: [leads], ...overrides } as unknown as FrogBotConfig;
}

function memoryKV() {
  const values = new Map<string, unknown>();
  const ttls = new Map<string, number>();

  const frogbot = {
    kv: {
      get: (key: string) => Promise.resolve(values.get(key) ?? null),
      set: (key: string, value: unknown, options?: { ttl?: number }) => {
        values.set(key, value);

        if (options?.ttl !== undefined) ttls.set(key, options.ttl);

        return Promise.resolve();
      },
      lock: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
    },
  } as unknown as FrogBot;

  return { frogbot, values, ttls };
}

describe('clientIp', () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it('reads nothing without trustProxy, whatever the headers say', () => {
    expect(
      clientIp(headers({ 'x-forwarded-for': '203.0.113.1', 'x-real-ip': '1.1.1.1' }), false),
    ).toBeUndefined();
  });

  it('takes the last x-forwarded-for entry, the one the proxy appended, then x-real-ip', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.1' }), true)).toBe(
      '203.0.113.1',
    );

    expect(clientIp(headers({ 'x-real-ip': ' 203.0.113.2 ' }), true)).toBe('203.0.113.2');
    expect(clientIp(headers({}), true)).toBeUndefined();
  });
});

describe('takeRateLimit', () => {
  const limit = { max: 2, window: 60 };
  const start = 1_800_000_000_000;

  it('allows max submits per window, then refuses with the seconds left', async () => {
    const { frogbot, ttls } = memoryKV();

    expect(await takeRateLimit(frogbot, '203.0.113.1', limit, start)).toEqual({ allowed: true });
    expect(await takeRateLimit(frogbot, '203.0.113.1', limit, start + 1_000)).toEqual({
      allowed: true,
    });

    expect(await takeRateLimit(frogbot, '203.0.113.1', limit, start + 20_500)).toEqual({
      allowed: false,
      retryAfter: 40,
    });

    expect(await takeRateLimit(frogbot, '203.0.113.2', limit, start + 20_500)).toEqual({
      allowed: true,
    });

    expect([...ttls.values()].every((ttl) => ttl > 0 && ttl <= 60_000)).toBe(true);
  });

  it('starts a fresh count in the next window', async () => {
    const { frogbot } = memoryKV();

    await takeRateLimit(frogbot, '203.0.113.1', limit, start);
    await takeRateLimit(frogbot, '203.0.113.1', limit, start);

    expect(await takeRateLimit(frogbot, '203.0.113.1', limit, start + 60_000)).toEqual({
      allowed: true,
    });
  });
});

describe('resolveSpamOptions', () => {
  it('defaults to 10 submits per 10 minutes, trustProxy off, no Turnstile', () => {
    expect(resolveSpamOptions({ collections: ['leads'] })).toEqual({
      rateLimit: { max: 10, window: 600 },
      trustProxy: false,
    });
  });

  it('fails boot for a bad limit or half a Turnstile key pair', () => {
    expect(() => resolveSpamOptions({ collections: [], rateLimit: { max: 0 } })).toThrow(
      'rateLimit: { max }',
    );

    expect(() => resolveSpamOptions({ collections: [], rateLimit: { window: 1.5 } })).toThrow(
      'rateLimit: { window }',
    );

    expect(() =>
      resolveSpamOptions({ collections: [], turnstile: { siteKey: 'site', secretKey: '' } }),
    ).toThrow('siteKey and secretKey');
  });
});

describe('formsPlugin page and warnings', () => {
  it('adds the public page and preview views and keeps the app’s own views', async () => {
    const result = await formsPlugin({ collections: ['leads'] })(
      config({
        admin: { components: { views: { reports: { Component: '/Reports', path: '/reports' } } } },
      }),
    );

    expect(result.admin?.components?.views).toEqual({
      reports: { Component: '/Reports', path: '/reports' },
      form: expect.objectContaining({
        Component: '@frogbotai/plugin-forms/rsc#FormView',
        path: '/forms',
        exact: false,
      }),
      formPreview: expect.objectContaining({
        Component: '@frogbotai/plugin-forms/rsc#FormPreviewView',
        path: '/forms-preview',
        exact: true,
      }),
    });
  });

  it('warns once at start while trustProxy is off, after the app’s own onInit', async () => {
    const own = vi.fn();
    const warn = vi.fn();
    const result = await formsPlugin({ collections: ['leads'] })(config({ onInit: own }));
    const hooks = [result.onInit].flat() as OnInit[];

    for (const hook of hooks) await hook({ logger: { warn } } as unknown as FrogBot);

    expect(hooks[0]).toBe(own);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('trustProxy is off');

    const trusted = await formsPlugin({ collections: ['leads'], trustProxy: true })(config());

    expect(trusted.onInit).toBeUndefined();
  });

  it('keeps the Turnstile secret on the server-only forms collection config', async () => {
    const result = await formsPlugin({
      collections: ['leads'],
      turnstile: { siteKey: 'site', secretKey: 'secret' },
    })(config());

    const forms = result.collections.find(({ slug }) => slug === 'forms');

    expect(forms?.custom?.['plugin-forms']).toMatchObject({
      spam: { turnstile: { siteKey: 'site', secretKey: 'secret' } },
    });
    expect(JSON.stringify(forms?.admin ?? {})).not.toContain('secret');
  });
});
