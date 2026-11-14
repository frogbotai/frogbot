import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
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
import { importExport, managedRuns } from '../../templates/crm/src/importExport.js';
import { auditLogAccess, roles } from '../../templates/crm/src/roles.js';
import { seedEndpoint } from '../../templates/crm/src/seed/endpoint.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { brokenSeedError, brokenSeedPath, importsDir, mediaDir } from './shared.js';

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
  ai: { defaultModel: 'openai/gpt-5.4-mini', providers: { openai: true } },
  plugins: [
    aiPolicyPlugin(),
    roles,
    auditLogPlugin({ overrides: { access: auditLogAccess } }),
    importExportPlugin({
      ...importExport,
      overrideImportCollection: async ({ collection }) => ({
        ...(await managedRuns({ collection })),
        upload: {
          ...(typeof collection.upload === 'object' ? collection.upload : {}),
          staticDir: importsDir,
        },
      }),
    }),
  ],
});
