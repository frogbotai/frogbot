import {
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

function libsqlIncludes(config: ReturnType<typeof withFrogBot>): string[] | undefined {
  return config.outputFileTracingIncludes?.['**/*']?.filter((path) => !path.includes('strtok3'));
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

  it('adds no platform plugin alias when FROGBOT_PLATFORM_PLUGIN is unset', () => {
    vi.stubEnv('FROGBOT_PLATFORM_PLUGIN', undefined);

    const config = withFrogBot();
    const result = config.webpack?.({ resolve: { alias: {} } }, {
      webpack: { IgnorePlugin: class {} },
    } as never);

    expect(Object.keys(config.turbopack?.resolveAlias ?? {})).toEqual(['@payloadcms/ui']);
    expect(Object.keys(result?.resolve?.alias ?? {})).toEqual(['@payloadcms/ui$']);
  });

  it('aliases frogbot/platform-plugin to the named package for webpack and Turbopack', () => {
    const app = createApp(createFixtureRoot());
    const pkg = join(app, 'node_modules/fixture-platform-plugin');
    writePackage(pkg, { name: 'fixture-platform-plugin', exports: './dist/index.js' });
    mkdirSync(join(pkg, 'dist'));
    writeFileSync(join(pkg, 'dist/index.js'), '');
    vi.stubEnv('FROGBOT_PLATFORM_PLUGIN', 'fixture-platform-plugin');

    const config = withFrogBot();
    const result = config.webpack?.({ resolve: { alias: {} } }, {
      webpack: { IgnorePlugin: class {} },
    } as never);

    expect(config.turbopack?.resolveAlias).toMatchObject({
      'frogbot/platform-plugin': './node_modules/fixture-platform-plugin/dist/index.js',
    });
    expect(result?.resolve?.alias).toMatchObject({
      'frogbot/platform-plugin$': join(pkg, 'dist/index.js'),
    });
  });

  it('throws at config time when the named package cannot be resolved', () => {
    const app = createApp(createFixtureRoot());
    vi.stubEnv('FROGBOT_PLATFORM_PLUGIN', 'missing-platform-plugin');

    expect(() => withFrogBot()).toThrow(
      `[frogbot] FROGBOT_PLATFORM_PLUGIN=missing-platform-plugin could not be resolved from ${app}`,
    );
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

  it('links file-type and sharp into the build and requires them by the link, in Node server builds only', async () => {
    const payloadDir = dirname(
      Module.createRequire(join(process.cwd(), 'packages/frogbot/package.json')).resolve('payload'),
    );

    const transformerDir = dirname(
      Module.createRequire(join(process.cwd(), 'packages/transformer-sharp/package.json')).resolve(
        '@payloadcms/transformer-sharp',
      ),
    );

    const distDir = join(createFixtureRoot(), '.next');
    const config = withFrogBot();
    const server = config.webpack?.(
      { externals: ['next-external'], output: { path: join(distDir, 'server') } },
      { isServer: true, nextRuntime: 'nodejs', webpack: { IgnorePlugin: class {} } } as never,
    );

    const browser = config.webpack?.({ output: { path: join(distDir, 'static') } }, {
      isServer: false,
      webpack: { IgnorePlugin: class {} },
    } as never);

    const [external] = (server?.externals as unknown[]).filter(
      (entry) => typeof entry === 'function',
    ) as ((
      data: { context?: string; request?: string },
      callback: (error?: Error, result?: string) => void,
    ) => void)[];

    const resolveExternal = (request: string, context = payloadDir) =>
      new Promise<string | undefined>((done) =>
        external({ context, request }, (_error, result) => done(result)),
      );

    const required = (external: string | undefined, name: string) => {
      const link = /^commonjs (\S+)$/.exec(external ?? '')?.[1];

      expect(link).toMatch(new RegExp(`^${name}-[0-9a-f]{16}$`));
      expect(isAbsolute(readlinkSync(join(distDir, 'node_modules', link!)))).toBe(false);

      return Module.createRequire(join(distDir, 'server', 'chunks', 'noop.js')).resolve(link!);
    };

    expect((server?.externals as unknown[])[0]).toBe(external);
    expect((browser?.externals as unknown[]).some((entry) => typeof entry === 'function')).toBe(
      false,
    );
    expect(required(await resolveExternal('file-type'), 'file-type')).toBe(
      Module.createRequire(join(payloadDir, 'noop.js')).resolve('file-type'),
    );
    expect(required(await resolveExternal('sharp', transformerDir), 'sharp')).toBe(
      Module.createRequire(join(transformerDir, 'noop.js')).resolve('sharp'),
    );
    expect(await resolveExternal('file-type')).toBe(await resolveExternal('file-type'));
    expect(await resolveExternal('payload')).toBeUndefined();
  });

  it('traces the Node entry of strtok3, which file-type imports at runtime', () => {
    const payloadRequire = Module.createRequire(
      Module.createRequire(join(process.cwd(), 'packages/next/package.json')).resolve('payload'),
    );

    const strtok3Entry = Module.createRequire(payloadRequire.resolve('file-type')).resolve(
      'strtok3',
    );

    const app = createApp(createFixtureRoot());
    const strtok3 = (withFrogBot().outputFileTracingIncludes?.['**/*'] ?? []).filter((path) =>
      path.includes('strtok3'),
    );

    expect(strtok3).toEqual([`${relative(app, dirname(strtok3Entry))}/**`]);
  });

  it('adds the hoisted libsql platform package', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual(['./node_modules/@libsql/linux-x64-gnu/**']);
  });

  it('adds the pnpm sibling path, not the store path or the hidden hoist', () => {
    const app = createApp(createFixtureRoot());
    const libsql = installPnpmLibsql(app, ['darwin-arm64']);

    linkDir(libsql, join(app, 'node_modules/libsql'));

    writePackage(join(app, 'node_modules/.pnpm/node_modules/@libsql/darwin-arm64'), {
      name: '@libsql/darwin-arm64',
    });

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([
      './node_modules/.pnpm/libsql@0.4.7/node_modules/@libsql/darwin-arm64/**',
    ]);
  });

  it('adds the workspace-root package in a pnpm workspace', () => {
    const root = createFixtureRoot();
    const app = createApp(join(root, 'apps/web'));
    const libsql = installPnpmLibsql(root, ['darwin-arm64']);

    linkDir(libsql, join(app, 'node_modules/libsql'));

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([
      '../../node_modules/.pnpm/libsql@0.4.7/node_modules/@libsql/darwin-arm64/**',
    ]);
  });

  it('adds the workspace-root package in an npm workspace', () => {
    const root = createFixtureRoot();

    createApp(join(root, 'apps/web'));
    installHoistedLibsql(root, ['linux-x64-gnu']);

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual(['../../node_modules/@libsql/linux-x64-gnu/**']);
  });

  it('adds both glibc and musl packages when both are installed', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu', 'linux-x64-musl']);

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([
      './node_modules/@libsql/linux-x64-gnu/**',
      './node_modules/@libsql/linux-x64-musl/**',
    ]);
  });

  it('adds nothing when libsql is not installed', () => {
    createApp(createFixtureRoot());

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([]);
  });

  it('adds nothing when libsql has no platform package installed', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, []);

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([]);
  });

  it("keeps the app's tracing includes", () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot({
      outputFileTracingIncludes: {
        '/custom': ['./custom/**'],
        '**/*': ['./extra/**'],
      },
    });

    expect(config.outputFileTracingIncludes?.['/custom']).toEqual(['./custom/**']);
    expect(libsqlIncludes(config)).toEqual([
      './extra/**',
      './node_modules/@libsql/linux-x64-gnu/**',
    ]);
  });

  it("passes the app's duplicate and unusual includes through unchanged", () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot({
      outputFileTracingIncludes: {
        '**/*': ['./node_modules/@libsql/linux-x64-gnu/**', './[broken/**'],
      },
    });

    expect(libsqlIncludes(config)).toEqual([
      './node_modules/@libsql/linux-x64-gnu/**',
      './[broken/**',
      './node_modules/@libsql/linux-x64-gnu/**',
    ]);
  });

  it('adds the nested platform package that libsql loads before the hoisted one', () => {
    const app = createApp(createFixtureRoot());

    installHoistedLibsql(app, ['linux-x64-gnu']);

    writePackage(join(app, 'node_modules/libsql/node_modules/@libsql/linux-x64-gnu'), {
      name: '@libsql/linux-x64-gnu',
    });

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([
      './node_modules/libsql/node_modules/@libsql/linux-x64-gnu/**',
    ]);
  });

  it('adds the platform package when the project folder has no package.json', () => {
    const app = createFixtureRoot();

    vi.spyOn(process, 'cwd').mockReturnValue(app);
    installHoistedLibsql(app, ['linux-x64-gnu']);

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual(['./node_modules/@libsql/linux-x64-gnu/**']);
  });

  it('ignores a libsql that only NODE_PATH can reach', () => {
    const root = createFixtureRoot();
    const hiddenHoist = join(root, 'node_modules/.pnpm');

    createApp(join(root, 'apps/api'));
    installHoistedLibsql(hiddenHoist, ['darwin-arm64']);
    vi.stubEnv('NODE_PATH', join(hiddenHoist, 'node_modules'));
    reloadNodePath();

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([]);
  });

  it('adds nothing when the project folder has no package.json or libsql', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(createFixtureRoot());

    const config = withFrogBot();

    expect(libsqlIncludes(config)).toEqual([]);
  });
});

describe('withFrogBot cacheComponents', () => {
  const rule = '**/{layout,page}.{js,jsx,ts,tsx,mjs,mts,cjs,cts}';

  type WebpackRule = { exclude?: RegExp; test?: RegExp; use?: string[] };

  const isFrogBotLoader = (loader: unknown) =>
    typeof loader === 'string' && /packages[/\\]next[/\\]src[/\\]instantLoader\.js$/.test(loader);

  function webpackRules(config: ReturnType<typeof withFrogBot>): WebpackRule[] {
    const result = config.webpack?.({ module: { rules: ['user-rule'] }, resolve: { alias: {} } }, {
      webpack: { IgnorePlugin: class {} },
    } as never);

    return result?.module?.rules ?? [];
  }

  it('adds the FrogBot instant loader for Turbopack after the app rules', () => {
    const config = withFrogBot({
      cacheComponents: true,
      turbopack: { rules: { [rule]: { loaders: ['user-loader'] }, '*.svg': ['svg-loader'] } },
    });

    const rules = config.turbopack?.rules?.[rule] as {
      condition?: { all: [unknown, { content: RegExp }] };
      loaders?: string[];
    }[];

    const frogbot = rules.find(({ loaders }) => loaders?.some(isFrogBotLoader));

    expect(rules[0]).toEqual({ loaders: ['user-loader'] });
    expect(config.turbopack?.rules?.['*.svg']).toEqual(['svg-loader']);
    expect(frogbot?.condition?.all[0]).toEqual({ not: 'foreign' });
    expect(frogbot?.condition?.all[1].content.test(`from '@frogbotai/next/layouts'`)).toBe(true);
    expect(frogbot?.condition?.all[1].content.test(`from "@frogbotai/next/views"`)).toBe(true);
    expect(frogbot?.condition?.all[1].content.test(`from '@frogbotai/next/routes'`)).toBe(false);
  });

  it('adds the FrogBot instant loader for webpack after the app config runs', () => {
    const webpack = vi.fn((config: { module?: { rules?: unknown[] } }) => ({
      ...config,
      module: { rules: [...(config.module?.rules ?? []), 'app-webpack-rule'] },
    }));

    const config = withFrogBot({ cacheComponents: true, webpack });
    const rules = webpackRules(config);
    const frogbot = rules.find(({ use }) => use?.some(isFrogBotLoader));

    expect(webpack).toHaveBeenCalledOnce();
    expect(rules.slice(0, 2)).toEqual(['user-rule', 'app-webpack-rule']);
    expect(frogbot).toMatchObject({ enforce: 'pre', exclude: /node_modules/ });
    expect(frogbot?.test?.test('/app/(frogbot)/layout.tsx')).toBe(true);
    expect(frogbot?.test?.test('/app/(frogbot)/[[...segments]]/page.ts')).toBe(true);
    expect(frogbot?.test?.test('/app/(frogbot)/[[...segments]]/not-found.tsx')).toBe(false);
    expect(frogbot?.exclude?.test('/app/node_modules/@frogbotai/next/dist/layout.js')).toBe(true);
  });

  it('adds no FrogBot instant loader with cacheComponents off', () => {
    const config = withFrogBot({ turbopack: { rules: { '*.svg': ['svg-loader'] } } });

    expect(config.turbopack?.rules).toEqual({ '*.svg': ['svg-loader'] });
    expect(webpackRules(config).some(({ use }) => use?.some(isFrogBotLoader))).toBe(false);
  });
});
