import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import type { CollectionConfig } from 'frogbot';
import { definePiece } from 'frogbot';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  apiKeysSlug,
  chatsSlug,
  messagesSlug,
  pieceSlug,
  refuseMessageDelete,
  refuseMessageID,
  refuseUserDelete,
  usersSlug,
} from './shared.js';

const piece = definePiece({
  slug: pieceSlug,
  label: 'Cascade',
  auth: z.object({ apiKey: z.string() }),
  client: () => ({}),
  actions: [],
})();

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  hooks: {
    beforeDelete: [
      ({ context }) => {
        if (context[refuseUserDelete]) throw new Error('User delete refused.');
      },
    ],
  },
  fields: [],
};

const Messages: CollectionConfig = {
  slug: messagesSlug,
  message: true,
  access: { delete: () => false },
  hooks: {
    beforeDelete: [
      ({ context, id }) => {
        if (context[refuseMessageDelete] && id === refuseMessageID) {
          throw new Error('Message delete refused.');
        }
      },
    ],
  },
  fields: [],
};

export default await buildTestConfig({
  collections: [Users, { slug: chatsSlug, chat: true, fields: [] }, Messages],
  connections: [{ piece, secret: true }],
  plugins: [apiKeysPlugin({ authCollection: usersSlug, collectionSlug: apiKeysSlug })],
});
