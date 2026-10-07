import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import {
  agentSlug,
  assetsSlug,
  chatPicksPreference,
  chatsSlug,
  filesSlug,
  messagesSlug,
  providerURL,
  textReaderName,
  usersSlug,
} from '../shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-chat-assets-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [
    { slug: usersSlug, auth: true, fields: [] },
    { slug: filesSlug, file: true, fields: [] },
  ],
  ai: {
    providers: {
      browser: {
        type: 'openai-compatible',
        baseUrl: process.env.BROWSER_PROVIDER_URL || `${providerURL}/v1`,
        apiKey: 'browser-provider-key',
        models: [
          { id: 'attachment-reader', mode: 'chat' },
          {
            id: 'text-reader',
            name: textReaderName,
            mode: 'chat',
            modalities: { input: ['text'], output: ['text'] },
          },
        ],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: {
        default: 'browser/attachment-reader',
        options: ['browser/attachment-reader', 'browser/text-reader'],
      },
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

        for (const collection of [assetsSlug, messagesSlug, chatsSlug, filesSlug] as const) {
          await req.frogbot.delete({ collection, where: {}, overrideAccess: true, req });
        }

        await req.frogbot.db.deleteMany({
          collection: 'payload-preferences',
          where: { key: { equals: chatPicksPreference } },
        });

        return Response.json({ reset: true });
      },
    },
  ],
});
