import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import { importExportPlugin } from '@frogbotai/plugin-import-export';

import { Files } from '../../templates/projects/src/collections/Files.js';
import { Projects } from '../../templates/projects/src/collections/Projects.js';
import { Tasks } from '../../templates/projects/src/collections/Tasks.js';
import { Users } from '../../templates/projects/src/collections/Users.js';
import { importExport, managedRuns } from '../../templates/projects/src/importExport.js';
import { auditLogAccess, roles } from '../../templates/projects/src/roles.js';
import { seedEndpoint } from '../../templates/projects/src/seed/endpoint.js';
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
