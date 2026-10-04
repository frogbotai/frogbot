import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AgentModelId, FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { question } from 'frogbot/tools';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelegramBot } from '../../packages/pieces/piece-telegram-bot/dist/index.js';
import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel.js';
import { testPort } from '../__helpers/shared/testPorts.js';
import {
  buttonData,
  callbackUpdate,
  createTelegramApi,
  keyboard,
  messageUpdate,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET,
  telegramUsers,
  telegramWebhook,
} from '../unit/frogbot/channels/telegramFixtures.js';
import { startPieceServer } from './nativePieceServers.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const modelPort = testPort(4095);
const queue = 'frogbot-channel:support:telegramBot';
const answerers = new Set([String(telegramUsers.frog.id), String(telegramUsers.toad.id)]);

type TelegramUser = (typeof telegramUsers)[keyof typeof telegramUsers];

const paintQuestion = {
  questions: [
    {
      header: 'Paint',
      question: 'Which paint should I use for the <front> door?',
      options: [
        { label: 'Ocean & Sky', description: 'A calm <blue> with 20% gloss' },
        { label: '*Forest* green', description: 'Deep, matte_finish' },
        { label: 'Rot · 赤 · красный' },
      ],
      custom: true,
    },
  ],
};

describe.skipIf(!RUN_E2E)(
  'Telegram native questions e2e — HTTP webhooks to persisted continuation',
  () => {
    const telegram = createTelegramApi();
    const blocked: string[] = [];

    let frogbot: FrogBotInstance;
    let model: StubChatModel;
    let bot: Awaited<ReturnType<typeof telegram.listen>>;
    let server: Awaited<ReturnType<typeof startPieceServer>>;
    let dataDir: string;

    function post(update: Record<string, unknown>, secret = TELEGRAM_WEBHOOK_SECRET) {
      return fetch(
        telegramWebhook(update, { secret, url: `${server.url}/api/webhooks/telegramBot` }),
        { signal: AbortSignal.timeout(20_000) } as RequestInit,
      );
    }

    async function runJobs() {
      for (let attempt = 0; attempt < 10; attempt++) {
        const result = await frogbot.jobs.run({ queue, limit: 10 });

        if (result.noJobsRemaining) return;
      }

      throw new Error('Channel jobs did not drain.');
    }

    async function say({
      chatId,
      from = telegramUsers.frog,
      replyTo,
      text,
    }: {
      chatId: number;
      from?: TelegramUser;
      replyTo?: number;
      text: string;
    }) {
      const response = await post(
        messageUpdate({ anchor: chatId < 0 ? replyTo : undefined, chatId, from, replyTo, text }),
      );

      expect(response.status).toBe(200);

      await runJobs();
    }

    function card(messageId: number) {
      return telegram.message(messageId);
    }

    async function tap({
      chatId,
      from = telegramUsers.frog,
      label,
      messageId,
    }: {
      chatId: number;
      from?: TelegramUser;
      label: string;
      messageId: number;
    }) {
      const data = buttonData(card(messageId), label);
      const response = await post(callbackUpdate({ chatId, data, from, messageId }));

      expect(response.status).toBe(200);
    }

    async function settlements() {
      const result = await frogbot.find({ collection: 'messages', limit: 0, overrideAccess: true });

      return result.docs.flatMap((doc) =>
        Object.entries(
          (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
        ),
      );
    }

    function toolResults() {
      return model.requests
        .at(-1)!
        .messages.filter(({ role }) => role === 'tool')
        .map(({ content }) => JSON.parse(String(content)));
    }

    function posted() {
      return JSON.stringify(
        telegram.calls.filter(
          ({ method }) => method === 'sendMessage' || method === 'editMessageText',
        ),
      );
    }

    beforeAll(async () => {
      bot = await telegram.listen();

      vi.stubEnv('TELEGRAM_API_BASE_URL', bot.url);

      const nativeFetch = globalThis.fetch;

      vi.stubGlobal('fetch', ((input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const allowed = [bot.url, server?.url, `http://127.0.0.1:${modelPort}`];

        if (!allowed.includes(url.origin)) {
          blocked.push(url.origin);

          throw new Error(`External network is disabled in the Telegram E2E: ${url.origin}`);
        }

        return nativeFetch(input, init);
      }) satisfies typeof fetch);

      model = await startStubChatModel(modelPort);
      dataDir = mkdtempSync(join(tmpdir(), 'frogbot-telegram-e2e-'));

      const telegramBot = createTelegramBot({
        auth: { botToken: TELEGRAM_BOT_TOKEN },
        webhookSecret: TELEGRAM_WEBHOOK_SECRET,
        botUsername: 'frogbot',
      });

      const config = await buildConfig({
        secret: 'telegram-questions-e2e-secret',
        telemetry: false,
        db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'telegram.db')}` } }),
        typescript: { autoGenerate: false },
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'chats', chat: true, fields: [] },
        ],
        ai: {
          providers: {
            local: {
              type: 'openai-compatible',
              baseUrl: `http://127.0.0.1:${modelPort}/v1`,
              models: [{ id: 'telegram-e2e', mode: 'chat' }],
            },
          },
        },
        agents: [
          {
            slug: 'support',
            model: 'local/telegram-e2e' as AgentModelId,
            instructions: 'Ask before painting.',
            tools: [question],
            channels: [telegramBot],
            access: ({ req }) =>
              Boolean(req.user) || answerers.has(req.context.channel?.author.id ?? ''),
          },
        ],
      });

      frogbot = await new FrogBot().init({ config, startChannelGateway: false });

      const app = new Hono();

      app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));

      server = await startPieceServer(app);
    });

    beforeEach(() => {
      model.reset();
    });

    afterEach(() => {
      expect(blocked).toEqual([]);
    });

    afterAll(async () => {
      try {
        const results = await Promise.allSettled([
          server?.close(),
          frogbot?.destroy(),
          model?.close(),
          bot?.close(),
        ]);

        for (const result of results) {
          if (result.status === 'rejected') throw result.reason;
        }
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();

        if (dataDir) rmSync(dataDir, { recursive: true, force: true });
      }
    });

    it('asks natively in a DM, settles a signed tap, and posts the persisted continuation', async () => {
      const chatId = telegramUsers.frog.id;

      model.respond(
        { toolCalls: [{ id: 'call-paint', name: 'question', input: paintQuestion }] },
        { text: 'Painting the door Forest green.' },
      );

      await say({ chatId, text: 'Paint the front door' });

      const messageId = telegram.lastMessageId();
      const asked = telegram.cards().at(-1)!;

      expect(asked).toMatchObject({ chat_id: String(chatId), parse_mode: 'HTML' });
      expect(keyboard(asked).map((row) => row.map(({ text }) => text))).toEqual([
        ['Ocean & Sky', '*Forest* green'],
        ['Rot · 赤 · красный'],
        ['Type your answer', 'Dismiss'],
      ]);
      expect(asked.text).toBe(
        [
          '<b>Paint</b>',
          'Which paint should I use for the &lt;front&gt; door?',
          '',
          '• <b>Ocean &amp; Sky</b> — A calm &lt;blue&gt; with 20% gloss',
          '• <b>*Forest* green</b> — Deep, matte_finish',
        ].join('\n'),
      );

      await tap({ chatId, label: '*Forest* green', messageId });

      expect(card(messageId)).toMatchObject({
        text: expect.stringContaining('✅ *Forest* green\n\n<i>Answered by Frog Smith</i>'),
        reply_markup: { inline_keyboard: [] },
      });
      expect(await settlements()).toMatchObject([
        [
          'call-paint',
          {
            outcome: 'answered',
            actor: {
              user: null,
              channel: { piece: 'telegramBot', account: 'telegramBot', id: '42' },
            },
          },
        ],
      ]);

      await runJobs();

      expect(toolResults()).toEqual([
        { answers: [{ header: 'Paint', selected: ['*Forest* green'] }] },
      ]);
      expect(posted()).toContain('Painting the door Forest green');
    });

    it('denies a participant without access, then records nothing for a tap after the answer', async () => {
      const chatId = -100500;

      model.respond(
        { toolCalls: [{ id: 'call-denied', name: 'question', input: paintQuestion }] },
        { text: 'Going with Ocean & Sky.' },
      );

      await say({ chatId, text: '@frogbot paint the shed' });

      const messageId = telegram.lastMessageId();

      await tap({ chatId, from: telegramUsers.newt, label: 'Ocean & Sky', messageId });

      expect(telegram.of('sendMessage').at(-1)).toMatchObject({
        chat_id: String(chatId),
        text: "Newt, you don't have access to answer this question.",
        reply_parameters: { message_id: messageId },
      });
      expect(await settlements()).not.toContainEqual(['call-denied', expect.anything()]);

      await tap({ chatId, from: telegramUsers.toad, label: 'Ocean & Sky', messageId });
      await runJobs();

      const edits = telegram.of('editMessageText').filter((body) => body.message_id === messageId);
      const requests = model.requests.length;

      await post(callbackUpdate({ chatId, data: 'q:0:o:1', from: telegramUsers.frog, messageId }));
      await runJobs();

      expect(
        telegram.of('editMessageText').filter((body) => body.message_id === messageId),
      ).toEqual([...edits, edits.at(-1)]);
      expect(model.requests).toHaveLength(requests);
      expect(
        (await settlements()).filter(([toolCallId]) => toolCallId === 'call-denied'),
      ).toMatchObject([['call-denied', { actor: { channel: { id: '7' } } }]]);
      expect(posted()).toContain('Going with Ocean & Sky');
    });

    it('refuses an answer over HTTP and keeps the question answerable in Telegram', async () => {
      const chatId = -100550;

      model.respond(
        { toolCalls: [{ id: 'call-web', name: 'question', input: paintQuestion }] },
        { text: 'Rot it is.' },
      );

      await say({ chatId, text: '@frogbot paint the gate' });

      const messageId = telegram.lastMessageId();
      const chats = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });
      const chat = chats.docs.find(
        (doc) =>
          (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id ===
          `telegram:${chatId}`,
      )!;

      const credentials = { email: 'owner@telegram.test', password: 'telegram-e2e-password' };
      const owner = await frogbot.create({
        collection: 'users' as never,
        data: credentials as never,
      });

      await frogbot.update({
        collection: 'chats' as never,
        id: chat.id,
        data: { user: owner.id } as never,
        overrideAccess: true,
      });

      const login = await fetch(`${server.url}/api/users/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const { token } = (await login.json()) as { token: string };

      const settle = (headers: Record<string, string>) =>
        fetch(`${server.url}/api/agents/support/chats/${chat.id}/settle`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({
            toolCallId: 'call-web',
            output: { answers: [{ header: 'Paint', selected: ['Ocean & Sky'] }] },
          }),
        });

      const anonymous = await settle({});
      const refused = await settle({ authorization: `Bearer ${token}` });

      expect(anonymous.ok).toBe(false);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({
        code: 'channel-chat',
        error:
          'This conversation happens in Telegram. Continue it there, or branch it into a new chat.',
      });
      expect(await settlements()).not.toContainEqual(['call-web', expect.anything()]);

      await tap({ chatId, label: 'Rot · 赤 · красный', messageId });
      await runJobs();

      expect(toolResults()).toEqual([
        { answers: [{ header: 'Paint', selected: ['Rot · 赤 · красный'] }] },
      ]);
    });

    it('rejects a forged webhook secret', async () => {
      const response = await post(messageUpdate({ text: 'Hello' }), 'forged-secret');

      expect(response.status).toBe(401);
    });

    it('walks a multi-question sequence in a group with toggles and a typed reply', async () => {
      const chatId = -100600;

      model.respond(
        {
          toolCalls: [
            {
              id: 'call-plan',
              name: 'question',
              input: {
                questions: [
                  {
                    header: 'Rooms',
                    question: 'Which rooms?',
                    options: [{ label: 'Kitchen' }, { label: 'Hall' }, { label: 'Attic' }],
                    multiple: true,
                    custom: false,
                  },
                  {
                    header: 'Finish',
                    question: 'Which finish?',
                    options: [{ label: 'Matte' }, { label: 'Gloss' }],
                    custom: true,
                  },
                ],
              },
            },
            {
              id: 'call-when',
              name: 'question',
              input: {
                questions: [
                  {
                    header: 'When',
                    question: 'When should I start?',
                    options: [{ label: 'Today' }, { label: 'Tomorrow' }],
                  },
                ],
              },
            },
          ],
        },
        { text: 'Kitchen and attic in eggshell, starting tomorrow.' },
      );

      await say({ chatId, text: '@frogbot plan the painting' });

      const plan = telegram.lastMessageId();

      expect(String(card(plan)!.text)).toContain('<b>Rooms</b> · 1 of 2');
      expect(telegram.cards().filter(({ chat_id }) => chat_id === String(chatId))).toHaveLength(1);

      await tap({ chatId, label: 'Attic', messageId: plan });
      await tap({ chatId, from: telegramUsers.toad, label: 'Kitchen', messageId: plan });
      await post(callbackUpdate({ chatId, data: 'q:0:d', messageId: plan }));

      await vi.waitFor(() => expect(String(card(plan)!.text)).toContain('<b>Finish</b> · 2 of 2'), {
        timeout: 10_000,
      });

      await post(callbackUpdate({ chatId, data: 'q:1:c', messageId: plan }));
      await say({ chatId, from: telegramUsers.toad, replyTo: plan, text: 'Eggshell' });

      expect(card(plan)).toMatchObject({ reply_markup: { inline_keyboard: [] } });

      const when = telegram.lastMessageId();

      expect(when).not.toBe(plan);
      expect(String(telegram.cards().at(-1)!.text)).toContain('<b>When</b>');

      await tap({ chatId, label: 'Tomorrow', messageId: when });
      await runJobs();

      expect(toolResults()).toEqual([
        {
          answers: [
            { header: 'Rooms', selected: ['Kitchen', 'Attic'] },
            { header: 'Finish', selected: [], custom: 'Eggshell' },
          ],
        },
        { answers: [{ header: 'When', selected: ['Tomorrow'] }] },
      ]);
      expect(posted()).toContain('Kitchen and attic in eggshell, starting tomorrow');
    });
  },
);
