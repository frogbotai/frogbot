import type { CollectionConfig } from 'frogbot'

import { gcsStorage } from '@frogbot/storage-gcs'
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
    gcsStorage({
      collections: { [mediaSlug]: true },
      bucket: 'frogbot-test-bucket',
      options: {
        apiEndpoint: 'http://localhost:4443',
        projectId: 'test',
      },
    }),
  ],
})
