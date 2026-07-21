import { describe, expect, it, vi } from 'vitest';

import type { FrogbotSanitizedConfig } from 'frogbot';

const mocks = vi.hoisted(() => ({
  RootPage: vi.fn(() => null),
  NotFoundPage: vi.fn(() => null),
  generatePageMetadata: vi.fn((args: unknown) => Promise.resolve(args)),
}));

vi.mock('@payloadcms/next/views', () => mocks);

const { RootPage, NotFoundPage, generatePageMetadata } = await import('./views.js');

function makeConfig() {
  const payloadConfig = { collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogbotSanitizedConfig;
  return { config, payloadConfig };
}

const params = Promise.resolve({ segments: [] });
const searchParams = Promise.resolve({});

describe('@frogbotai/next views', () => {
  it('RootPage forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    const element = RootPage({ config, importMap: {}, params, searchParams });

    expect(element.type).toBe(mocks.RootPage);
    expect(element.props.params).toBe(params);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('NotFoundPage forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    const element = NotFoundPage({ config, importMap: {}, params, searchParams });

    expect(element.type).toBe(mocks.NotFoundPage);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('generatePageMetadata forwards args with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    await generatePageMetadata({ config, params, searchParams });

    const forwarded = mocks.generatePageMetadata.mock.calls[0][0] as { config: Promise<unknown> };
    await expect(forwarded.config).resolves.toBe(payloadConfig);
  });
});
