import { importExportPlugin } from '@frogbotai/plugin-import-export';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { contactsSlug, importsDir, usersSlug } from '../shared.js';

export default buildTestConfig({
  admin: { user: usersSlug },
  collections: [
    { slug: usersSlug, auth: true, access: openAccess, fields: [] },
    { slug: contactsSlug, access: openAccess, fields: [{ name: 'name', type: 'text' }] },
    { slug: 'ledger', access: openAccess, fields: [{ name: 'amount', type: 'number' }] },
  ],
  plugins: [
    importExportPlugin({
      collections: [],
      overrideImportCollection: ({ collection }) => ({
        ...collection,
        upload: {
          ...(typeof collection.upload === 'object' && collection.upload),
          staticDir: importsDir,
        },
      }),
    }),
  ],
});
