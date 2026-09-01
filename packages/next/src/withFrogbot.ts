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
  '@frogbotai/email-nodemailer',
  '@frogbotai/email-resend',
  '@frogbotai/kv-redis',
];

const ALWAYS_SERVER_PACKAGES = ['@frogbotai/gateway'];

const NATIVE_EXTERNALS = ['@basetenlabs/performance-client'];

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
