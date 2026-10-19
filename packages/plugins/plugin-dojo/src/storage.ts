import { s3Storage } from '@frogbotai/storage-s3';
import type { FrogBotConfig } from 'frogbot';

import type { DojoEnv } from './env.js';

const CHAT_ASSETS_SLUG = 'frogbot-chat-assets';

function uploadSlugs(config: FrogBotConfig): string[] {
  const slugs = config.collections
    .filter((collection) => Boolean(collection.upload) || collection.file === true)
    .map(({ slug }) => slug);

  return [...new Set([...slugs, CHAT_ASSETS_SLUG])];
}

/** Adds R2 storage for every upload collection, unless the app set its own storage. */
export function withDojoStorage(config: FrogBotConfig, env: DojoEnv): FrogBotConfig {
  if (config.storage?.length) return config;

  const storage = s3Storage({
    bucket: env.r2Bucket,
    config: {
      endpoint: env.r2Endpoint,
      region: 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
    },
    collections: Object.fromEntries(uploadSlugs(config).map((slug) => [slug, { prefix: slug }])),
  });

  return { ...config, storage: [storage] };
}
