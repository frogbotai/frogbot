import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { mcpPlugin } from '@frogbotai/plugin-mcp';
import { buildConfig } from 'frogbot';

export const config = buildConfig({
  secret: 'test-secret',
  db: sqliteAdapter({ client: { url: 'file:skill.db' } }),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'posts',
      fields: [
        {
          name: 'title',
          type: 'text',
        },
      ],
    },
  ],
  plugins: [
    apiKeysPlugin(),
    mcpPlugin({
      collections: {
        posts: {
          enabled: {
            find: true,
          },
        },
      },
    }),
  ],
});
