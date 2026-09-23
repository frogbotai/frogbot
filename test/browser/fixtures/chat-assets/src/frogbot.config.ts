import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { type AgentModelId, buildConfig } from 'frogbot';

import { agentSlug, assetsSlug, chatsSlug, filesSlug, messagesSlug, usersSlug } from '../shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-chat-assets-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [{ slug: usersSlug, auth: true, fields: [] }],
  ai: {
    providers: {
      browser: {
        type: 'openai-compatible',
        baseUrl: process.env.BROWSER_PROVIDER_URL || 'http://localhost:3126/v1',
        apiKey: 'browser-provider-key',
        models: [{ id: 'attachment-reader', mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'browser/attachment-reader' as AgentModelId,
      instructions: 'Describe the attachment.',
      access: ({ req }) => Boolean(req.user),
    },
  ],
  endpoints: [
    {
      path: '/browser/reset',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        for (const collection of [assetsSlug, messagesSlug, chatsSlug, filesSlug]) {
          await req.frogbot.delete({ collection, where: {}, overrideAccess: true, req });
        }

        return Response.json({ reset: true });
      },
    },
  ],
});
