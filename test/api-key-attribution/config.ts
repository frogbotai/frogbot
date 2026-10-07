import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import type { CaptureStorage } from '@frogbotai/plugin-capture';
import { capturePlugin } from '@frogbotai/plugin-capture';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { testPort } from '../__helpers/shared/testPorts.js';

export const upstreamPort = testPort(3989);

export const captureBlobs = new Map<string, Uint8Array>();

const captureStorage: CaptureStorage = {
  put(key, bytes) {
    captureBlobs.set(key, bytes);

    return Promise.resolve();
  },
  get(key) {
    const bytes = captureBlobs.get(key);

    if (!bytes) return Promise.reject(new Error(`Missing capture blob ${key}`));

    return Promise.resolve(bytes);
  },
  delete(key) {
    captureBlobs.delete(key);

    return Promise.resolve();
  },
  list() {
    const keys = captureBlobs.keys();

    return { [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve(keys.next()) }) };
  },
};

const Accounts: CollectionConfig = {
  slug: 'accounts',
  auth: true,
  access: openAccess,
  fields: [
    process.env.FROGBOT_DATABASE === 'mongodb'
      ? { name: 'apiKeyId', type: 'text' }
      : { name: 'apiKeyId', type: 'number' },
  ],
};

export default await buildTestConfig({
  collections: [Accounts],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        apiKey: 'test-key',
        models: [{ id: 'priced', mode: 'chat', cost: { input: 1, output: 2 } }],
      },
    },
  },
  plugins: [
    apiKeysPlugin({
      authCollection: 'accounts',
      collectionSlug: 'credentials',
      tokenPrefix: 'attr',
    }),
    capturePlugin({ enabled: true, collectionSlug: 'captures', storage: captureStorage }),
  ],
});
