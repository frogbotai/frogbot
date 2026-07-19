import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { list, del } from '@vercel/blob'
import { storageContractSuite } from '../__helpers/shared/storage/storageContractSuite'
import { mediaSlug } from './shared.js'

// Must be set before any @vercel/blob calls
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_emulator_test'
process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL = 'http://localhost:3100/api/blob'
process.env.STORAGE_VERCEL_BLOB_BASE_URL = 'http://localhost:3100'
process.env.VERCEL_BLOB_RETRIES = '0'
process.env.VERCEL_BLOB_CALLBACK_URL = 'http://localhost:3100'

const dirname = path.dirname(fileURLToPath(import.meta.url))

storageContractSuite('vercel-blob', dirname, mediaSlug, {
  async beforeSetup() {
    const { blobs } = await list()
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url))
    }
  },
})
