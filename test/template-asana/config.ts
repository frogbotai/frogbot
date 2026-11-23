import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import { commentsPlugin } from '@frogbotai/plugin-comments';
import { importExportPlugin } from '@frogbotai/plugin-import-export';

import { Files } from '../../templates/asana/src/collections/Files.js';
import { Projects } from '../../templates/asana/src/collections/Projects.js';
import { Tasks } from '../../templates/asana/src/collections/Tasks.js';
import { Users } from '../../templates/asana/src/collections/Users.js';
import { importExport, managedRuns } from '../../templates/asana/src/importExport.js';
import { auditLogAccess, roles } from '../../templates/asana/src/roles.js';
import { seedEndpoint } from '../../templates/asana/src/seed/endpoint.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { brokenSeedError, brokenSeedPath, filesDir, importsDir } from './shared.js';

export default await buildTestConfig({
  collections: [Projects, Tasks, Users, { ...Files, upload: { staticDir: filesDir } }],
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
    commentsPlugin(),
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
