import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';

const Members: CollectionConfig = {
  slug: 'members',
  auth: true,
  access: {
    read: ({ req }) => {
      const tenant = (req.user as { tenant?: unknown } | null)?.tenant;

      return typeof tenant === 'string' ? { tenant: { equals: tenant } } : false;
    },
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [{ name: 'tenant', type: 'text', required: true }],
};

export default await buildTestConfig({
  collections: [Members],
  ai: {
    providers: { openai: { apiKey: 'test-key', models: ['gpt-4.1-mini'] } },
  },
  plugins: [
    aiPolicyPlugin({ authCollection: 'members' }),
    apiKeysPlugin({ authCollection: 'members', collectionSlug: 'keys', tokenPrefix: 'test' }),
  ],
});
