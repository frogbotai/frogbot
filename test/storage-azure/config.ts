import type { CollectionConfig } from 'frogbot'

import { azureStorage } from '@frogbotai/storage-azure'
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

const connectionString =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'

export default await buildTestConfig({
  collections: [Users, Media],
  plugins: [
    azureStorage({
      collections: { [mediaSlug]: true },
      allowContainerCreate: true,
      baseURL: 'http://127.0.0.1:10000/devstoreaccount1',
      connectionString,
      containerName: 'frogbot-test',
    }),
  ],
})
