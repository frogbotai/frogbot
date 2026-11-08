import { lexicalEditor } from '@frogbotai/richtext-lexical';

import { Activities } from '../../templates/crm/src/collections/Activities.js';
import { Companies } from '../../templates/crm/src/collections/Companies.js';
import { Contacts } from '../../templates/crm/src/collections/Contacts.js';
import { Deals } from '../../templates/crm/src/collections/Deals.js';
import { Media } from '../../templates/crm/src/collections/Media.js';
import { Tasks } from '../../templates/crm/src/collections/Tasks.js';
import { Users } from '../../templates/crm/src/collections/Users.js';
import { seedEndpoint } from '../../templates/crm/src/seed/endpoint.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { brokenSeedError, brokenSeedPath, mediaDir } from './shared.js';

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
});
