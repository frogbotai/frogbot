import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { type AgentModelId, buildConfig } from 'frogbot';
import { question } from 'frogbot/tools';

import { agentSlug, chatsSlug, messagesSlug, modelPort, usersSlug } from '../shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-question-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [{ slug: usersSlug, auth: true, fields: [] }],
  ai: {
    providers: {
      browser: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'browser-provider-key',
        models: [{ id: 'questioner', mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'browser/questioner' as AgentModelId,
      instructions: 'Ask before acting.',
      access: ({ req }) => Boolean(req.user),
      tools: [question],
    },
  ],
  endpoints: [
    {
      path: '/browser/reset',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        for (const collection of [messagesSlug, chatsSlug, 'frogbot-chat-turns']) {
          await req.frogbot.delete({ collection, where: {}, overrideAccess: true, req });
        }

        return Response.json({ reset: true });
      },
    },
  ],
});
