import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { sqliteAdapter } from '../../../packages/db-sqlite/src/index.js';
import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { createDiscord } from '../../../packages/pieces/piece-discord/src/index.js';
import { createTelegramBot } from '../../../packages/pieces/piece-telegram-bot/src/index.js';

describe('Discord Gateway deployment configuration', () => {
  it.each([
    { conversational: false, triggers: true },
    { conversational: true, triggers: false },
    { conversational: true, triggers: true },
  ])(
    'mounts the shared cron listener, conversational = $conversational, triggers = $triggers',
    async ({ conversational, triggers }) => {
      const discord = createDiscord({
        auth: { botToken: 'bot-token' },
        applicationId: 'application-id',
        publicKey: 'ab'.repeat(32),
      });

      const config = await buildConfig({
        secret: 'gateway-config-test-secret',
        serverURL: 'https://frogbot.example',
        db: sqliteAdapter({ client: { url: 'file::memory:' } }),
        typescript: { autoGenerate: false },
        admin: { importMap: { autoGenerate: false } },
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: { apiKey: 'test-key' } } },
        agents: [
          {
            slug: 'ops',
            instructions: 'Handle incoming Discord events.',
            model: 'openai/gpt-4o',
            channels: conversational ? [discord] : [],
            triggers: triggers
              ? [{ trigger: discord.triggers.messageCreated, handler: async () => {} }]
              : [],
          },
        ],
      });

      const runtime = await config._internal.payloadConfig;

      expect(runtime.endpoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/channels/gateway', method: 'post' }),
        ]),
      );
    },
  );

  it.each([false, true])(
    'omits the cron listener without an initialized adapter, HTTP trigger = %s',
    async (httpTrigger) => {
      const discord = createDiscord({ auth: { botToken: 'bot-token' } });
      const telegram = createTelegramBot({
        auth: { botToken: 'telegram-token' },
        webhookSecret: 'telegram-secret',
      });

      const config = await buildConfig({
        secret: 'gateway-config-test-secret',
        serverURL: 'https://frogbot.example',
        db: sqliteAdapter({ client: { url: 'file::memory:' } }),
        typescript: { autoGenerate: false },
        admin: { importMap: { autoGenerate: false } },
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: { apiKey: 'test-key' } } },
        pieces: [discord],
        agents: [
          {
            slug: 'ops',
            instructions: 'Handle incoming events.',
            model: 'openai/gpt-4o',
            triggers: httpTrigger
              ? [{ trigger: telegram.triggers.newUpdate, handler: async () => {} }]
              : [],
          },
        ],
      });

      const runtime = await config._internal.payloadConfig;
      const paths = runtime.endpoints.map(({ path }) => path);

      expect(paths).not.toContain('/channels/gateway');
      expect(paths.includes('/webhooks/:instance')).toBe(httpTrigger);
    },
  );
});
