import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { withFrogBot } = await import('../../../packages/next/src/withFrogBot.js');

type HeaderRoute = { headers: { key: string; value: string }[]; source: string };

async function buildHeader(config: ReturnType<typeof withFrogBot>): Promise<string | undefined> {
  const routes = ((await config.headers?.()) ?? []) as HeaderRoute[];

  return routes.flatMap((route) => route.headers).find((header) => header.key === 'x-frogbot-build')
    ?.value;
}

beforeEach(() => {
  vi.stubEnv('FROGBOT_BUILD_ID', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('withFrogBot build ID', () => {
  it('sends the build ID in a header on every path and inlines the same ID for the client', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const config = withFrogBot({});
    const routes = ((await config.headers?.()) ?? []) as HeaderRoute[];
    const route = routes.find((entry) =>
      entry.headers.some((header) => header.key === 'x-frogbot-build'),
    );

    expect(route?.source).toBe('/:path*');
    expect(config.env?.FROGBOT_BUILD_ID).toMatch(/^[\da-f-]{36}$/);
    expect(await buildHeader(config)).toBe(config.env?.FROGBOT_BUILD_ID);
  });

  it('keeps one ID per config, used as Next’s build ID too', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const config = withFrogBot({});
    const id = config.env?.FROGBOT_BUILD_ID;

    expect(await buildHeader(config)).toBe(id);
    expect(await buildHeader(config)).toBe(id);
    expect(await config.generateBuildId?.()).toBe(id);
  });

  it('gives each build its own ID', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const first = withFrogBot({}).env?.FROGBOT_BUILD_ID;

    vi.stubEnv('FROGBOT_BUILD_ID', undefined);

    expect(withFrogBot({}).env?.FROGBOT_BUILD_ID).not.toBe(first);
  });

  it('reuses the ID across config loads in one build, as webpack build workers load it again', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const parent = withFrogBot({});

    expect(process.env.FROGBOT_BUILD_ID).toBe(parent.env?.FROGBOT_BUILD_ID);

    const worker = withFrogBot({});

    expect(worker.env?.FROGBOT_BUILD_ID).toBe(parent.env?.FROGBOT_BUILD_ID);
    expect(await buildHeader(worker)).toBe(parent.env?.FROGBOT_BUILD_ID);
  });

  it('keeps the app’s headers, env and generateBuildId', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const config = withFrogBot({
      env: { APP_FLAG: 'on' },
      generateBuildId: () => Promise.resolve('git-sha'),
      headers: () => Promise.resolve([{ source: '/app', headers: [{ key: 'x-app', value: '1' }] }]),
    });

    const routes = ((await config.headers?.()) ?? []) as HeaderRoute[];

    expect(routes[0]).toEqual({ source: '/app', headers: [{ key: 'x-app', value: '1' }] });
    expect(config.env).toMatchObject({ APP_FLAG: 'on', FROGBOT_BUILD_ID: expect.any(String) });
    expect(await config.generateBuildId?.()).toBe('git-sha');
    expect(await buildHeader(config)).toBe(config.env?.FROGBOT_BUILD_ID);
  });

  it('adds no build ID in development, which hot reloads instead', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const config = withFrogBot({});

    expect(config.env?.FROGBOT_BUILD_ID).toBeUndefined();
    expect(await buildHeader(config)).toBeUndefined();
  });
});
