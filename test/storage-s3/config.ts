import { s3Storage } from '@frogbotai/storage-s3';
import type { CollectionConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  agentSlug,
  bucket,
  chatsSlug,
  mediaSlug,
  modelPort,
  s3ClientConfig,
  usersSlug,
} from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Media: CollectionConfig = {
  slug: mediaSlug,
  upload: { disableLocalStorage: true },
  access: openAccess,
  fields: [{ name: 'alt', type: 'text' }],
};

const Chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  access: { read: ({ req }) => (req.user ? { user: { equals: req.user.id } } : false) },
  fields: [],
};

export default await buildTestConfig({
  collections: [Users, Media, Chats],
  ai: {
    defaultModel: 'test/vision',
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [
          {
            id: 'vision',
            mode: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
          },
        ],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'test/vision',
      instructions: 'Help the user.',
      access: () => true,
      tools: [...todoTools],
    },
  ],
  plugins: [
    s3Storage({
      collections: { [mediaSlug]: true },
      bucket,
      config: s3ClientConfig,
    }),
  ],
});
