import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative } from 'node:path';

import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

type WithFrogBotOptions = {
  devBundleServerPackages?: boolean;
};

type LibsqlPackage = {
  optionalDependencies?: Record<string, string>;
  root: string;
};

const FROGBOT_SERVER_PACKAGES = [
  'frogbot',
  '@frogbotai/db-d1-sqlite',
  '@frogbotai/db-mongodb',
  '@frogbotai/db-postgres',
  '@frogbotai/db-sqlite',
  '@frogbotai/db-vercel-postgres',
  '@frogbotai/kv-redis',
];

const ALWAYS_SERVER_PACKAGES = ['@frogbotai/gateway'];

const NATIVE_EXTERNALS = ['@basetenlabs/performance-client'];

const RUNTIME_IMPORT_PACKAGES = ['file-type', 'sharp'];

type ExternalData = { context?: string; request?: string };

type ExternalCallback = (error?: Error, result?: string) => void;

function getPackageRoot(entry: string, name: string): string {
  let dir = dirname(entry);

  while (basename(dir) !== name || basename(dirname(dir)) !== 'node_modules') {
    const parent = dirname(dir);

    if (parent === dir) throw new Error(`${entry} is not inside ${name}`);

    dir = parent;
  }

  return dir;
}

function linkPackage(linkDir: string, root: string, name: string): string {
  const linkName = `${name}-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`;

  mkdirSync(linkDir, { recursive: true });

  try {
    symlinkSync(relative(linkDir, root), join(linkDir, linkName), 'junction');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  return linkName;
}

function runtimeImportExternal(linkDir: string) {
  return ({ context, request }: ExternalData, callback: ExternalCallback) => {
    if (!context || !request || !RUNTIME_IMPORT_PACKAGES.includes(request)) return callback();

    try {
      const entry = createRequire(join(context, 'noop.js')).resolve(request);

      return callback(
        undefined,
        `commonjs ${linkPackage(linkDir, getPackageRoot(entry, request), request)}`,
      );
    } catch {
      return callback();
    }
  };
}

const require = createRequire(import.meta.url);
const payloadNextRequire = createRequire(require.resolve('@payloadcms/next/withPayload'));
const PAYLOAD_UI_ROOT = payloadNextRequire.resolve('@payloadcms/ui');

const PLATFORM_PLUGIN = 'frogbot/platform-plugin';

function resolvePlatformPlugin(): string | undefined {
  const name = process.env.FROGBOT_PLATFORM_PLUGIN;

  if (!name) return undefined;

  try {
    return createRequire(join(process.cwd(), 'package.json')).resolve(name);
  } catch (cause) {
    throw new Error(
      `[frogbot] FROGBOT_PLATFORM_PLUGIN=${name} could not be resolved from ${process.cwd()}`,
      { cause },
    );
  }
}

function getProjectRelativePath(path: string): string {
  const projectRelativePath = relative(process.cwd(), path).replaceAll('\\', '/');

  return projectRelativePath.startsWith('.') ? projectRelativePath : `./${projectRelativePath}`;
}

function findLibsqlPackage(): LibsqlPackage | undefined {
  const manifestPath = getNodeModulesPaths(process.cwd())
    .map((path) => join(path, 'libsql', 'package.json'))
    .find((path) => existsSync(path));

  if (!manifestPath) return undefined;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  return {
    optionalDependencies: manifest.optionalDependencies,
    root: realpathSync(dirname(manifestPath)),
  };
}

function getRuntimeImportTracingIncludes(): string[] {
  try {
    const payloadRequire = createRequire(payloadNextRequire.resolve('payload'));
    const fileTypeRequire = createRequire(payloadRequire.resolve('file-type'));

    return [`${getProjectRelativePath(dirname(fileTypeRequire.resolve('strtok3')))}/**`];
  } catch {
    return [];
  }
}

function getNodeModulesPaths(dir: string): string[] {
  const parent = dirname(dir);
  const paths = basename(dir) === 'node_modules' ? [] : [join(dir, 'node_modules')];

  return parent === dir ? paths : [...paths, ...getNodeModulesPaths(parent)];
}

function getLibsqlTracingIncludes(): string[] {
  const libsql = findLibsqlPackage();

  if (!libsql) return [];

  const nodeModulesPaths = getNodeModulesPaths(libsql.root);

  return Object.keys(libsql.optionalDependencies || {})
    .filter((name) => name.startsWith('@libsql/'))
    .flatMap((name) => {
      const packageRoot = nodeModulesPaths
        .map((path) => join(path, name))
        .find((path) => existsSync(path));

      return packageRoot ? [`${getProjectRelativePath(packageRoot)}/**`] : [];
    });
}

export function withFrogBot(
  nextConfig: NextConfig = {},
  options: WithFrogBotOptions = {},
): NextConfig {
  const platformPlugin = resolvePlatformPlugin();

  const frogbotConfig: NextConfig = {
    ...nextConfig,
    serverExternalPackages: [
      ...new Set([
        ...(nextConfig.serverExternalPackages || []),
        ...ALWAYS_SERVER_PACKAGES,
        ...(process.env.NODE_ENV === 'development' && options.devBundleServerPackages !== true
          ? FROGBOT_SERVER_PACKAGES
          : []),
      ]),
    ],
    turbopack: {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...nextConfig.turbopack?.resolveAlias,
        '@payloadcms/ui': getProjectRelativePath(PAYLOAD_UI_ROOT),
        ...(platformPlugin && { [PLATFORM_PLUGIN]: getProjectRelativePath(platformPlugin) }),
      },
    },
    outputFileTracingIncludes: {
      ...nextConfig.outputFileTracingIncludes,
      '**/*': [
        ...(nextConfig.outputFileTracingIncludes?.['**/*'] || []),
        ...getLibsqlTracingIncludes(),
        ...getRuntimeImportTracingIncludes(),
      ],
    },
    webpack: (webpackConfig, webpackOptions) => {
      const incoming =
        typeof nextConfig.webpack === 'function'
          ? nextConfig.webpack(webpackConfig, webpackOptions)
          : webpackConfig;

      const outputPath = incoming?.output?.path;

      return {
        ...incoming,
        externals: [
          ...(webpackOptions?.isServer && webpackOptions.nextRuntime === 'nodejs' && outputPath
            ? [runtimeImportExternal(join(dirname(outputPath), 'node_modules'))]
            : []),
          ...(incoming?.externals || []),
          ...NATIVE_EXTERNALS,
        ],
        resolve: {
          ...incoming?.resolve,
          alias: {
            ...incoming?.resolve?.alias,
            '@payloadcms/ui$': PAYLOAD_UI_ROOT,
            ...(platformPlugin && { [`${PLATFORM_PLUGIN}$`]: platformPlugin }),
          },
          extensionAlias: {
            ...incoming?.resolve?.extensionAlias,
            '.cjs': ['.cts', '.cjs'],
            '.js': ['.ts', '.tsx', '.js', '.jsx'],
            '.mjs': ['.mts', '.mjs'],
          },
        },
      };
    },
  };

  return withPayload(frogbotConfig, options);
}
