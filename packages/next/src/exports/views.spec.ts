import { describe, expect, it, vi } from 'vitest';

import type { FrogbotSanitizedConfig } from 'frogbot';

const mocks = vi.hoisted(() => ({
  RootPage: vi.fn(() => null),
  NotFoundPage: vi.fn(() => null),
  generatePageMetadata: vi.fn((args: unknown) => Promise.resolve(args)),
}));

vi.mock('@payloadcms/next/views', () => mocks);

const { RootPage, NotFoundPage, generatePageMetadata } = await import('./views.js');

function makeConfig(admin?: Record<string, unknown>) {
  const payloadConfig = { admin, collections: [] };
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

  it('generatePageMetadata injects the FrogBot favicon when admin.meta.icons is unset', async () => {
    const { config } = makeConfig({ meta: {} });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      icons: Array<{ rel: string; type: string; url: string }>;
    };

    expect(metadata.icons).toHaveLength(1);
    expect(metadata.icons[0]).toMatchObject({ rel: 'icon', type: 'image/png' });
    expect(metadata.icons[0].url).toBeTruthy();
  });

  it('generatePageMetadata keeps user icons when admin.meta.icons is set', async () => {
    const icons = [{ rel: 'icon', url: '/my-favicon.png' }];
    const { config } = makeConfig({ meta: { icons } });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      icons?: unknown;
    };

    expect(metadata.icons).toBeUndefined();
  });

  it('generatePageMetadata injects the FrogBot OG image for static mode without user images', async () => {
    const { config } = makeConfig({ meta: { defaultOGImageType: 'static' } });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      openGraph: { images: Array<{ url: string; width: number; height: number }> };
    };

    expect(metadata.openGraph.images).toHaveLength(1);
    expect(metadata.openGraph.images[0]).toMatchObject({ width: 1200, height: 630 });
    expect(metadata.openGraph.images[0].url).toBeTruthy();
  });

  it('generatePageMetadata leaves openGraph alone when user images or non-static mode are set', async () => {
    const withImages = makeConfig({
      meta: { defaultOGImageType: 'static', openGraph: { images: [{ url: '/og.png' }] } },
    });
    const dynamicMode = makeConfig({ meta: { defaultOGImageType: 'dynamic' } });

    const a = (await generatePageMetadata({ config: withImages.config, params, searchParams })) as {
      openGraph?: unknown;
    };
    const b = (await generatePageMetadata({ config: dynamicMode.config, params, searchParams })) as {
      openGraph?: unknown;
    };

    expect(a.openGraph).toBeUndefined();
    expect(b.openGraph).toBeUndefined();
  });
});
