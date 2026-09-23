import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AccessResult, AgentModelId, CollectionConfig, Tool } from 'frogbot';
import { saveChatAsset } from 'frogbot/tools';
import { z } from 'zod';

import { buildTestConfig } from '../../../__helpers/shared/buildTestConfig.js';
import {
  agentSlug,
  assetsSlug,
  chatsSlug,
  instructions,
  modelId,
  toolSlug,
  usersSlug,
} from './shared.js';

const inputSchema = z.object({ content: z.string() });

const saveReport: Tool<typeof inputSchema> = {
  slug: toolSlug,
  description: 'Save the report as a downloadable chat asset.',
  inputSchema,
  execute: ({ content }, ctx) =>
    saveChatAsset({
      ctx,
      filename: 'report.txt',
      mimeType: 'text/plain',
      data: Buffer.from(content),
    }),
};

const chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  access: {
    read: ({ req }): AccessResult => {
      if (!req.user) return false;

      return {
        or: [{ user: { equals: req.user.id } }, { sharedWith: { contains: req.user.id } }],
      };
    },
  },
  fields: [
    { name: 'title', type: 'text', defaultValue: 'Chat assets E2E' },
    { name: 'sharedWith', type: 'relationship', relationTo: usersSlug, hasMany: true },
  ],
};

const dataDir = process.env.CHAT_ASSETS_E2E_DATA_DIR;
const providerUrl = process.env.CHAT_ASSETS_E2E_PROVIDER_URL;

if (!dataDir || !providerUrl) throw new Error('Missing chat assets E2E environment');

const config = await buildTestConfig({
  telemetry: false,
  db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'assets.db')}` } }),
  collections: [{ slug: usersSlug, auth: true, access: { create: () => true }, fields: [] }, chats],
  ai: {
    providers: {
      local: {
        type: 'openai-compatible',
        baseUrl: `${providerUrl}/v1`,
        models: [{ id: modelId, mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: `local/${modelId}` as AgentModelId,
      instructions,
      tools: [saveReport],
    },
  ],
});

const payloadConfig = await config._internal.payloadConfig;
const assets = payloadConfig.collections.find(({ slug }) => slug === assetsSlug);

if (!assets || typeof assets.upload !== 'object') throw new Error('Missing chat assets storage');

assets.upload.staticDir = join(dataDir, 'uploads');

export default config;
