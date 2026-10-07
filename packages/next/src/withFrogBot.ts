import { existsSync, readFileSync, realpathSync } from 'node:fs';
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

const require = createRequire(import.meta.url);
const payloadNextRequire = createRequire(require.resolve('@payloadcms/next/withPayload'));
const PAYLOAD_UI_ROOT = payloadNextRequire.resolve('@payloadcms/ui');

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
      },
    },
    outputFileTracingIncludes: {
      ...nextConfig.outputFileTracingIncludes,
      '**/*': [
        ...(nextConfig.outputFileTracingIncludes?.['**/*'] || []),
        ...getLibsqlTracingIncludes(),
      ],
    },
    webpack: (webpackConfig, webpackOptions) => {
      const incoming =
        typeof nextConfig.webpack === 'function'
          ? nextConfig.webpack(webpackConfig, webpackOptions)
          : webpackConfig;

      return {
        ...incoming,
        externals: [...(incoming?.externals || []), ...NATIVE_EXTERNALS],
        resolve: {
          ...incoming?.resolve,
          alias: {
            ...incoming?.resolve?.alias,
            '@payloadcms/ui$': PAYLOAD_UI_ROOT,
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
