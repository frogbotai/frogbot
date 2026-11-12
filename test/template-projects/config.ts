import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import { importExportPlugin } from '@frogbotai/plugin-import-export';

import { Projects } from '../../templates/projects/src/collections/Projects.js';
import { Tasks } from '../../templates/projects/src/collections/Tasks.js';
import { Users } from '../../templates/projects/src/collections/Users.js';
import { auditLogAccess, roles } from '../../templates/projects/src/roles.js';
import { seedEndpoint } from '../../templates/projects/src/seed/endpoint.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { brokenSeedError, brokenSeedPath } from './shared.js';

const importable = ['projects', 'tasks'].map((slug) => ({
  slug,
  import: { disableJobsQueue: true },
  export: { disableJobsQueue: true },
}));

export default await buildTestConfig({
  collections: [Projects, Tasks, Users],
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
    importExportPlugin({ collections: importable }),
  ],
});
