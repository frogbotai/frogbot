import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { usageReportsPlugin } from '@frogbotai/plugin-usage-reports';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: openAccess,
  fields: [
    { name: 'name', type: 'text' },
    { name: 'role', type: 'select', options: ['admin', 'member'], defaultValue: 'member' },
  ],
};

export default await buildTestConfig({
  collections: [Users],
  ai: {
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: 'public',
        models: [{ id: 'big-pickle', mode: 'chat' }],
      },
    },
  },
  plugins: [
    apiKeysPlugin({ authCollection: 'users' }),
    usageReportsPlugin({
      retention: { days: 30 },
      access: ({ req }) => {
        const user = req.user as { id: number | string; role?: string } | null | undefined;

        if (!user) return false;

        return user.role === 'admin' ? true : { user: { equals: user.id } };
      },
    }),
  ],
});
