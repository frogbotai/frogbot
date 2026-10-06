import { r2Storage, type R2StorageOptions } from '@frogbotai/storage-r2';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { mediaSlug, usersSlug } from './shared.js';

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

const workersOnly = () => new Error('R2 bucket bindings need the Cloudflare Workers runtime');
const unavailable = () => Promise.reject(workersOnly());

const bucket: R2StorageOptions['bucket'] = {
  createMultipartUpload: unavailable,
  delete: unavailable,
  get: unavailable,
  head: unavailable,
  list: unavailable,
  put: unavailable,
  resumeMultipartUpload: () => {
    throw workersOnly();
  },
};

export default await buildTestConfig({
  collections: [Users, Media],
  plugins: [
    r2Storage({
      collections: { [mediaSlug]: true },
      bucket,
    }),
  ],
});
