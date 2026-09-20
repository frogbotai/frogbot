import { isAbsolute, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { withFrogbot } = await import('../../../packages/next/src/withFrogbot.js');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('withFrogbot', () => {
  it.each(['production', undefined])('externalizes the gateway when NODE_ENV is %s', (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);

    const config = withFrogbot();

    expect(config.serverExternalPackages).toContain('@frogbotai/gateway');
  });

  it.each([
    [undefined, true],
    [true, false],
  ])(
    'externalizes the gateway when devBundleServerPackages is %s in development',
    (devBundleServerPackages, includesDevPackages) => {
      vi.stubEnv('NODE_ENV', 'development');

      const config = withFrogbot({}, { devBundleServerPackages });

      expect(config.serverExternalPackages).toContain('@frogbotai/gateway');
      expect(config.serverExternalPackages).toEqual(
        includesDevPackages
          ? expect.arrayContaining(['frogbot'])
          : expect.not.arrayContaining(['frogbot']),
      );
    },
  );

  it('does not add development server packages when explicitly bundled', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const config = withFrogbot({}, { devBundleServerPackages: true });

    expect(config.serverExternalPackages).not.toContain('frogbot');
  });

  it('preserves consumer server external packages without duplicating the gateway', () => {
    const config = withFrogbot({
      serverExternalPackages: ['consumer-package', '@frogbotai/gateway'],
    });

    expect(config.serverExternalPackages).toContain('consumer-package');
    expect(
      config.serverExternalPackages?.filter((item) => item === '@frogbotai/gateway'),
    ).toHaveLength(1);
  });

  it('uses one Payload UI root identity while preserving public subpath entries', () => {
    const config = withFrogbot({
      turbopack: {
        resolveAlias: { consumer: '/consumer' },
      },
    });
    const result = config.webpack?.({ resolve: { alias: { consumer: '/consumer' } } }, {
      webpack: { IgnorePlugin: class {} },
    } as never);

    expect(config.turbopack?.resolveAlias).toEqual({
      consumer: '/consumer',
      '@payloadcms/ui': expect.stringContaining('@payloadcms/ui'),
    });
    expect(result?.resolve?.alias).toEqual({
      consumer: '/consumer',
      '@payloadcms/ui$': expect.stringContaining('@payloadcms/ui'),
    });
    expect(result?.resolve?.alias).not.toHaveProperty('@payloadcms/ui/elements');
    expect(result?.resolve?.alias).not.toHaveProperty('@payloadcms/ui/icons');
  });

  it('uses a slash-normalized project-relative Turbopack alias outside the project root', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/project/apps/example');

    const config = withFrogbot({
      turbopack: {
        resolveAlias: { consumer: './consumer' },
      },
    });
    const result = config.webpack?.({ resolve: { alias: {} } }, {
      webpack: { IgnorePlugin: class {} },
    } as never);
    const turbopackAlias = config.turbopack?.resolveAlias?.['@payloadcms/ui'];
    const webpackAlias = result?.resolve?.alias?.['@payloadcms/ui$'];

    expect(turbopackAlias).toBeTypeOf('string');
    expect(turbopackAlias).toMatch(/^\.\.\//);
    expect(turbopackAlias).not.toContain('\\');
    expect(isAbsolute(turbopackAlias as string)).toBe(false);
    expect(resolve(process.cwd(), turbopackAlias as string)).toBe(webpackAlias);
    expect(config.turbopack?.resolveAlias?.consumer).toBe('./consumer');
    expect(isAbsolute(webpackAlias as string)).toBe(true);
  });

  it('calls the consumer webpack config and appends native externals', () => {
    const webpack = vi.fn((config: { externals?: string[] }) => ({
      ...config,
      externals: ['consumer-external'],
      resolve: {
        alias: { consumer: '/consumer' },
        extensionAlias: { '.custom': ['.custom.ts'] },
      },
    }));
    const config = withFrogbot({ webpack });
    const webpackContext = { webpack: { IgnorePlugin: class {} } };

    const result = config.webpack?.({ externals: ['base-external'] }, webpackContext as never);

    expect(webpack).toHaveBeenCalledWith({ externals: ['base-external'] }, webpackContext);
    expect(result?.externals).toContain('consumer-external');
    expect(result?.externals).toContain('@basetenlabs/performance-client');
    expect(result?.resolve?.alias).toEqual({
      consumer: '/consumer',
      '@payloadcms/ui$': expect.stringContaining('@payloadcms/ui'),
    });
    expect(result?.resolve?.extensionAlias).toEqual({
      '.cjs': ['.cts', '.cjs'],
      '.custom': ['.custom.ts'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    });
  });
});
