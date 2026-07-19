import type { CollectionConfig } from 'frogbot'

import { vercelBlobStorage } from '@frogbotai/storage-vercel-blob'
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js'
import { mediaSlug, usersSlug } from './shared.js'

// Vercel Blob emulator env vars (must be set before the plugin runs)
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_emulator_test'
process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL = 'http://localhost:3100/api/blob'
process.env.STORAGE_VERCEL_BLOB_BASE_URL = 'http://localhost:3100'
process.env.VERCEL_BLOB_RETRIES = '0'
process.env.VERCEL_BLOB_CALLBACK_URL = 'http://localhost:3100'

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
    vercelBlobStorage({
      collections: { [mediaSlug]: true },
      token: 'vercel_blob_rw_emulator_test',
    }),
  ],
})
