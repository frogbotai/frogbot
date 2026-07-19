import type { CollectionConfig } from 'frogbot'

import { r2Storage } from '@frogbot/storage-r2'
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js'
import { mediaSlug, usersSlug } from './shared.js'

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
}

const Media: CollectionConfig = {
  slug: mediaSlug,
  upload: { disableLocalStorage: true },
  access: openAccess,
  fields: [{ name: 'alt', type: 'text' }],
}

export default await buildTestConfig({
  collections: [Users, Media],
  plugins: [
    r2Storage({
      collections: { [mediaSlug]: true },
      bucket: 'frogbot-test-bucket',
      config: {
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        endpoint: 'http://localhost:4566',
        forcePathStyle: true,
        region: 'us-east-1',
      },
    }),
  ],
})
