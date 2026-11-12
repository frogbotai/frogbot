import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import { lexicalEditor } from '@frogbotai/richtext-lexical';

import { Activities } from '../../templates/crm/src/collections/Activities.js';
import { Companies } from '../../templates/crm/src/collections/Companies.js';
import { Contacts } from '../../templates/crm/src/collections/Contacts.js';
import { Deals } from '../../templates/crm/src/collections/Deals.js';
import { Media } from '../../templates/crm/src/collections/Media.js';
import { Tasks } from '../../templates/crm/src/collections/Tasks.js';
import { Users } from '../../templates/crm/src/collections/Users.js';
import { auditLogAccess, roles } from '../../templates/crm/src/roles.js';
import { seedEndpoint } from '../../templates/crm/src/seed/endpoint.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { brokenSeedError, brokenSeedPath, importsDir, mediaDir } from './shared.js';

const importable = ['companies', 'contacts', 'deals', 'activities', 'tasks'].map((slug) => ({
  slug,
  import: { disableJobsQueue: true },
  export: { disableJobsQueue: true },
}));

export default await buildTestConfig({
  editor: lexicalEditor(),
  collections: [
    Companies,
    Contacts,
    Deals,
    Activities,
    Tasks,
    Users,
    { ...Media, upload: { staticDir: mediaDir } },
  ],
  endpoints: [
    seedEndpoint(),
    {
      ...seedEndpoint(() => Promise.reject(new Error(brokenSeedError))),
      path: brokenSeedPath,
    },
  ],
  plugins: [
    roles,
    auditLogPlugin({ overrides: { access: auditLogAccess } }),
    importExportPlugin({
      collections: importable,
      overrideImportCollection: ({ collection }) => ({
        ...collection,
        upload: {
          ...(typeof collection.upload === 'object' ? collection.upload : {}),
          staticDir: importsDir,
        },
      }),
    }),
  ],
});
