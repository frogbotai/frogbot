import type { CollectionConfig } from 'frogbot';

import { apiKeysPlugin } from '../../packages/plugins/plugin-api-keys/src/index.js';
import type { CaptureStorage } from '../../packages/plugins/plugin-capture/src/index.js';
import { capturePlugin } from '../../packages/plugins/plugin-capture/src/index.js';
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { testPort } from '../__helpers/shared/testPorts.js';

export const upstreamPort = testPort(3989);

export const captureBlobs = new Map<string, Uint8Array>();

const captureStorage: CaptureStorage = {
  async put(key, bytes) {
    captureBlobs.set(key, bytes);
  },
  async get(key) {
    const bytes = captureBlobs.get(key);

    if (!bytes) throw new Error(`Missing capture blob ${key}`);

    return bytes;
  },
  async delete(key) {
    captureBlobs.delete(key);
  },
  async *list() {
    yield* captureBlobs.keys();
  },
};

const Accounts: CollectionConfig = {
  slug: 'accounts',
  auth: true,
  access: openAccess,
  fields: [
    // Same type as the adapter's ids, so a session user can carry a real-looking key id.
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
