import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { agentSlug, chatsSlug, messagesSlug, notesSlug, usersSlug } from '../shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-dojo-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [
    { slug: usersSlug, auth: true, fields: [] },
    {
      slug: notesSlug,
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'owner', type: 'relationship', relationTo: usersSlug },
      ],
    },
  ],
  ai: {
    providers: {
      browser: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9/v1',
        apiKey: 'browser-provider-key',
        models: [{ id: 'helper', mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: { default: 'browser/helper', options: ['browser/helper'] },
      instructions: 'Help.',
      access: ({ req }) => Boolean(req.user),
    },
  ],
  endpoints: [
    {
      path: '/browser/seed',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        const count = Number(new URL(req.url!).searchParams.get('messages') ?? 6);
        const chat = await req.frogbot.create({
          collection: chatsSlug,
          data: { title: 'Badge chat', user: req.user.id, agent: agentSlug },
          overrideAccess: true,
          req,
        });

        for (let index = 0; index < count; index++) {
          const role = index % 2 ? 'assistant' : 'user';
          const text = `Message ${index + 1}. `.repeat(role === 'assistant' ? 30 : 3);

          await req.frogbot.create({
            collection: messagesSlug,
            data: {
              id: `badge-${chat.id}-${index}`,
              chat: chat.id,
              role,
              parts: [{ type: 'text', text }],
            },
            overrideAccess: true,
            req,
          });
        }

        return Response.json({ chatId: chat.id });
      },
    },
  ],
});
