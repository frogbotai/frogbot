import { afterEach, describe, expect, it, vi } from 'vitest';

const { withFrogbot } = await import('../../../packages/next/src/withFrogbot.js');

afterEach(() => {
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

  it('calls the consumer webpack config and appends native externals', () => {
    const webpack = vi.fn((config: { externals?: string[] }) => ({
      ...config,
      externals: ['consumer-external'],
    }));
    const config = withFrogbot({ webpack });
    const webpackContext = { webpack: { IgnorePlugin: class {} } };

    const result = config.webpack?.({ externals: ['base-external'] }, webpackContext as never);

    expect(webpack).toHaveBeenCalledWith({ externals: ['base-external'] }, webpackContext);
    expect(result?.externals).toContain('consumer-external');
    expect(result?.externals).toContain('@basetenlabs/performance-client');
  });
});
