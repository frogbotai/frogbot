import { s3Storage } from '@frogbotai/storage-s3';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { bucket, chatsSlug, mediaSlug, s3ClientConfig, usersSlug } from './shared.js';

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
  fields: [],
};

export default await buildTestConfig({
  collections: [Users, Media, Chats],
  plugins: [
    s3Storage({
      collections: { [mediaSlug]: true },
      bucket,
      config: s3ClientConfig,
    }),
  ],
});
