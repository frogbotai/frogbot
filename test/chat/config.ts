import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { agentSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users],
  ai: {
    providers: {
      openai: { apiKey: 'test-key' },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'openai/gpt-4.1-mini',
      instructions: 'Help the user.',
    },
  ],
});
