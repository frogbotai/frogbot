import { Projects } from '../../templates/projects/src/collections/Projects.js';
import { Tasks } from '../../templates/projects/src/collections/Tasks.js';
import { Users } from '../../templates/projects/src/collections/Users.js';
import { seedEndpoint } from '../../templates/projects/src/seed/endpoint.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { brokenSeedError, brokenSeedPath } from './shared.js';

export default await buildTestConfig({
  collections: [Projects, Tasks, Users],
  endpoints: [
    seedEndpoint(),
    {
      ...seedEndpoint(() => Promise.reject(new Error(brokenSeedError))),
      path: brokenSeedPath,
    },
  ],
});
