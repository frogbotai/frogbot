import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { withFrogBot } = await import('../../../packages/next/src/withFrogBot.js');

const LIBSQL_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64-gnu',
  'linux-arm64-musl',
  'linux-x64-gnu',
  'linux-x64-musl',
  'win32-x64-msvc',
];

let fixtureRoot: string | undefined;

// Node reads NODE_PATH once at startup; this re-reads it after a stub.
function reloadNodePath(): void {
  (Module as unknown as { _initPaths: () => void })._initPaths();
}

function createFixtureRoot(): string {
  fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'frogbot-with-frogbot-')));

  return fixtureRoot;
}

function writePackage(dir: string, manifest: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
}

function writeLibsql(dir: string): void {
  writePackage(dir, {
    name: 'libsql',
    exports: { '.': './index.js' },
    optionalDependencies: Object.fromEntries(
      LIBSQL_PLATFORMS.map((platform) => [`@libsql/${platform}`, '0.4.7']),
    ),
  });

  writeFileSync(join(dir, 'index.js'), '');
}

function linkDir(target: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(relative(dirname(path), target), path, 'dir');
}

function installHoistedLibsql(root: string, platforms: string[]): void {
  writeLibsql(join(root, 'node_modules/libsql'));

  for (const platform of platforms) {
    writePackage(join(root, 'node_modules/@libsql', platform), { name: `@libsql/${platform}` });
  }
}

function installPnpmLibsql(root: string, platforms: string[]): string {
  const store = join(root, 'node_modules/.pnpm');
  const libsql = join(store, 'libsql@0.4.7/node_modules/libsql');

  writeLibsql(libsql);

  for (const platform of platforms) {
    const platformRoot = join(store, `@libsql+${platform}@0.4.7/node_modules/@libsql`, platform);

    writePackage(platformRoot, { name: `@libsql/${platform}` });
    linkDir(platformRoot, join(store, 'libsql@0.4.7/node_modules/@libsql', platform));
  }

  return libsql;
}

function createApp(dir: string): string {
  writePackage(dir, { name: 'app' });
  vi.spyOn(process, 'cwd').mockReturnValue(dir);

  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  reloadNodePath();

  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });

  fixtureRoot = undefined;
});

describe('withFrogBot', () => {
  it.each(['production', undefined])('externalizes the gateway when NODE_ENV is %s', (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);

    const config = withFrogBot();

    expect(config.serverExternalPackages).toContain('@frogbotai/gateway');
  });

  it.each([
    [undefined, true],
    [true, false],
  ])(
    'externalizes the gateway when devBundleServerPackages is %s in development',
    (devBundleServerPackages, includesDevPackages) => {
      vi.stubEnv('NODE_ENV', 'development');

      const config = withFrogBot({}, { devBundleServerPackages });

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

    const config = withFrogBot({}, { devBundleServerPackages: true });

    expect(config.serverExternalPackages).not.toContain('frogbot');
  });

  it('preserves consumer server external packages without duplicating the gateway', () => {
    const config = withFrogBot({
      serverExternalPackages: ['consumer-package', '@frogbotai/gateway'],
    });

    expect(config.serverExternalPackages).toContain('consumer-package');
    expect(
      config.serverExternalPackages?.filter((item) => item === '@frogbotai/gateway'),
    ).toHaveLength(1);
  });

  it('uses one Payload UI root identity while preserving public subpath entries', () => {
    const config = withFrogBot({
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

    const config = withFrogBot({
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

    const config = withFrogBot({ webpack });
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

  it('adds the hoisted libsql platform package', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      './node_modules/@libsql/linux-x64-gnu/**',
      '@libsql/client',
    ]);
  });

  it('adds the pnpm sibling path, not the store path or the hidden hoist', () => {
    const app = createApp(createFixtureRoot());
    const libsql = installPnpmLibsql(app, ['darwin-arm64']);

    linkDir(libsql, join(app, 'node_modules/libsql'));

    writePackage(join(app, 'node_modules/.pnpm/node_modules/@libsql/darwin-arm64'), {
      name: '@libsql/darwin-arm64',
    });

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      './node_modules/.pnpm/libsql@0.4.7/node_modules/@libsql/darwin-arm64/**',
      '@libsql/client',
    ]);
  });

  it('adds the workspace-root package in a pnpm workspace', () => {
    const root = createFixtureRoot();
    const app = createApp(join(root, 'apps/web'));
    const libsql = installPnpmLibsql(root, ['darwin-arm64']);

    linkDir(libsql, join(app, 'node_modules/libsql'));

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      '../../node_modules/.pnpm/libsql@0.4.7/node_modules/@libsql/darwin-arm64/**',
      '@libsql/client',
    ]);
  });

  it('adds the workspace-root package in an npm workspace', () => {
    const root = createFixtureRoot();

    createApp(join(root, 'apps/web'));
    installHoistedLibsql(root, ['linux-x64-gnu']);

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      '../../node_modules/@libsql/linux-x64-gnu/**',
      '@libsql/client',
    ]);
  });

  it('adds both glibc and musl packages when both are installed', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu', 'linux-x64-musl']);

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      './node_modules/@libsql/linux-x64-gnu/**',
      './node_modules/@libsql/linux-x64-musl/**',
      '@libsql/client',
    ]);
  });

  it('adds nothing when libsql is not installed', () => {
    createApp(createFixtureRoot());

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual(['@libsql/client']);
  });

  it('adds nothing when libsql has no platform package installed', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, []);

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual(['@libsql/client']);
  });

  it("keeps the app's tracing includes and the libsql client entry", () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot({
      outputFileTracingIncludes: {
        '/custom': ['./custom/**'],
        '**/*': ['./extra/**'],
      },
    });

    expect(config.outputFileTracingIncludes).toEqual({
      '/custom': ['./custom/**'],
      '**/*': ['./extra/**', './node_modules/@libsql/linux-x64-gnu/**', '@libsql/client'],
    });
  });

  it("passes the app's duplicate and unusual includes through unchanged", () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot({
      outputFileTracingIncludes: {
        '**/*': ['./node_modules/@libsql/linux-x64-gnu/**', './[broken/**'],
      },
    });

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      './node_modules/@libsql/linux-x64-gnu/**',
      './[broken/**',
      './node_modules/@libsql/linux-x64-gnu/**',
      '@libsql/client',
    ]);
  });

  it('adds the nested platform package that libsql loads before the hoisted one', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    writePackage(join(app, 'node_modules/libsql/node_modules/@libsql/linux-x64-gnu'), {
      name: '@libsql/linux-x64-gnu',
    });

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      './node_modules/libsql/node_modules/@libsql/linux-x64-gnu/**',
      '@libsql/client',
    ]);
  });

  it('adds the platform package when the project folder has no package.json', () => {
    const app = createFixtureRoot();

    vi.spyOn(process, 'cwd').mockReturnValue(app);
    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual([
      './node_modules/@libsql/linux-x64-gnu/**',
      '@libsql/client',
    ]);
  });

  it('ignores a libsql that only NODE_PATH can reach', () => {
    const root = createFixtureRoot();
    const hiddenHoist = join(root, 'node_modules/.pnpm');

    createApp(join(root, 'apps/api'));
    installHoistedLibsql(hiddenHoist, ['darwin-arm64']);
    vi.stubEnv('NODE_PATH', join(hiddenHoist, 'node_modules'));
    reloadNodePath();

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual(['@libsql/client']);
  });

  it('adds nothing when the project folder has no package.json or libsql', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(createFixtureRoot());

    const config = withFrogBot();

    expect(config.outputFileTracingIncludes?.['**/*']).toEqual(['@libsql/client']);
  });
});
