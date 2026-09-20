import { createRequire } from 'node:module';
import { relative } from 'node:path';

import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

type WithFrogbotOptions = {
  devBundleServerPackages?: boolean;
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

function getTurbopackPayloadUIRoot(): string {
  const projectRelativePath = relative(process.cwd(), PAYLOAD_UI_ROOT).replaceAll('\\', '/');

  return projectRelativePath.startsWith('.') ? projectRelativePath : `./${projectRelativePath}`;
}

export function withFrogbot(
  nextConfig: NextConfig = {},
  options: WithFrogbotOptions = {},
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
        '@payloadcms/ui': getTurbopackPayloadUIRoot(),
      },
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
