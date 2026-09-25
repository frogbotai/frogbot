import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type {
  AfterChangeHook,
  AgentConfig,
  BeforeChangeHook,
  CollectionConfig,
  FrogBotConfig,
  FrogBotInstance,
  FrogBotRequest,
} from 'frogbot';
import { buildConfig, getFrogBot } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { createCoreConfig, type Post, Users } from './core-context.js';

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'You are a concise and friendly assistant.',
};

export const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || '' } }),
  editor: lexicalEditor(),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    defaultModel: 'zen/big-pickle',
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: 'public',
        models: [{ id: 'big-pickle', mode: 'chat' }],
      },
    },
  },
  admin: {},
  agents: [general(), assistant],
};

export default buildConfig(config);

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    {
      name: 'status',
      type: 'select',
      options: ['draft', 'published'],
      defaultValue: 'draft',
    },
  ],
  timestamps: true,
};

export const setPublishedAt: BeforeChangeHook<Post> = ({ data, operation }) => {
  if (operation !== 'update' || data.status !== 'published') return data;

  return {
    ...data,
    publishedAt: new Date().toISOString(),
  };
};

export async function initializedInstance() {
  const config = buildConfig(createCoreConfig());
  const frogbot = await getFrogBot({ config });
  const posts = await frogbot.find({
    collection: 'posts',
    where: {
      status: { equals: 'published' },
    },
    sort: '-createdAt',
  });

  return posts;
}

export async function enforceAccess({
  frogbot,
  user,
}: {
  frogbot: FrogBotInstance;
  user: FrogBotRequest['user'];
}) {
  const posts = await frogbot.find({
    collection: 'posts',
    user,
    overrideAccess: false,
  });

  return posts;
}

export const auditPost: AfterChangeHook<Post> = async ({ doc, req }) => {
  await req.frogbot.create({
    collection: 'audit-events',
    data: {
      action: 'post-created',
      document: doc.id,
    },
    req,
  });

  return doc;
};

export const syncPost: AfterChangeHook<Post> = async ({ context, doc, req }) => {
  if (context.syncingPost) return doc;

  await req.frogbot.update({
    collection: 'posts',
    id: doc.id,
    data: { synced: true },
    context: { syncingPost: true },
    req,
  });

  return doc;
};
