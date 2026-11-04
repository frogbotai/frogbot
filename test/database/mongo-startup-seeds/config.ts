import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Seeds: CollectionConfig = {
  slug: 'seeds',
  access: openAccess,
  versions: true,
  fields: [{ name: 'keyword', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users, Seeds],
  onInit: async (frogbot) => {
    for (const keyword of ['a', 'b', 'c']) {
      await frogbot.create({ collection: 'seeds', data: { keyword }, overrideAccess: true });
    }
  },
});
