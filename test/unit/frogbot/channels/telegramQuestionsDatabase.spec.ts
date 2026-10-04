import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BasePayload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import {
  CHANNEL_TASK_SLUG,
  getChannelHost,
} from '../../../../packages/frogbot/src/channels/host.js';
import type { ChannelTaskInput } from '../../../../packages/frogbot/src/channels/types.js';
import { settleClientToolCall } from '../../../../packages/frogbot/src/chat/turn/settle.js';
import { findTurnState } from '../../../../packages/frogbot/src/chat/turn/state.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { type FrogBot, initFrogBotFromPayload } from '../../../../packages/frogbot/src/frogbot.js';
import { question, type QuestionInput } from '../../../../packages/frogbot/src/tools/question.js';
import { createTelegramBot } from '../../../../packages/pieces/piece-telegram-bot/src/index.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';
import { testPort } from '../../../__helpers/shared/testPorts.js';
import {
  callbackUpdate,
  createTelegramApi,
  messageUpdate,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET,
  telegramUsers,
  telegramWebhook,
} from './telegramFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const modelPort = testPort(3984);
const answerers = new Set([String(telegramUsers.frog.id), String(telegramUsers.toad.id)]);

const colorQuestion: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color?',
      options: [{ label: 'Red' }, { label: 'Blue' }],
      custom: true,
    },
  ],
};

async function boot(directory: string): Promise<FrogBot> {
  const telegram = createTelegramBot({
    auth: { botToken: TELEGRAM_BOT_TOKEN },
    webhookSecret: TELEGRAM_WEBHOOK_SECRET,
    botUsername: 'frogbot',
  });

  const config = await buildConfig({
    secret: 'telegram-questions-test-secret',
    db: sqliteAdapter({ client: { url: `file:${directory}/questions.db` }, push: true }),
    typescript: { autoGenerate: false },
    admin: { importMap: { autoGenerate: false } },
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'chats', chat: true, fields: [] },
    ],
    ai: {
      providers: {
        test: {
          type: 'openai-compatible',
          baseUrl: `http://127.0.0.1:${modelPort}/v1`,
          apiKey: 'test-key',
          models: [{ id: 'gpt-4.1-mini', mode: 'chat' }],
        },
      },
    },
    agents: [
      {
        slug: 'support',
        model: 'test/gpt-4.1-mini',
        instructions: 'Ask before acting.',
        tools: [question],
        channels: [telegram],
        access: ({ req }) =>
          Boolean(req.user) || answerers.has(req.context.channel?.author.id ?? ''),
      },
    ],
  });

  const payload = await new BasePayload().init({
    config: config._internal.payloadConfig,
    disableOnInit: true,
  });

  return initFrogBotFromPayload(payload, config, {
    disableOnInit: true,
    startChannelGateway: false,
  });
}

describe('Telegram questions with SQLite persistence', { timeout: 30_000 }, () => {
  const api = createTelegramApi();

  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;
  let server: Awaited<ReturnType<typeof api.listen>>;

  const host = () => getChannelHost(frogbot)!;
  const webhook = (update: Record<string, unknown>) =>
    host().webhook('telegramBot', telegramWebhook(update));

  async function jobs(chatId: number): Promise<ChannelTaskInput[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs
      .map((job) => job.input as ChannelTaskInput)
      .filter((input) => input.thread.id === `telegram:${chatId}`);
  }

  async function run(input: ChannelTaskInput | undefined) {
    await host().run(JSON.parse(JSON.stringify(input)));
  }

  async function continuations(chatId: number) {
    return (await jobs(chatId)).filter((input) => input.kind === 'continue');
  }

  async function chatDoc(chatId: number) {
    const result = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });

    return result.docs.find(
      (doc) =>
        (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id ===
        `telegram:${chatId}`,
    )!;
  }

  async function settlements(chatId: number) {
    const result = await frogbot.find({
      collection: 'messages',
      where: {
        and: [{ chat: { equals: (await chatDoc(chatId)).id } }, { role: { equals: 'assistant' } }],
      },
      overrideAccess: true,
    });

    return result.docs.flatMap((doc) =>
      Object.entries(
        (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
      ),
    );
  }

  async function ask({
    chatId,
    input = colorQuestion,
    toolCallId,
  }: {
    chatId: number;
    input?: QuestionInput;
    toolCallId: string;
  }): Promise<number> {
    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await webhook(messageUpdate({ chatId, text: chatId < 0 ? '@frogbot paint it' : 'Paint it' }));
    await run((await jobs(chatId)).at(-1));

    return api.lastMessageId();
  }

  function tap({
    card,
    chatId,
    data,
    from = telegramUsers.frog,
  }: {
    card: number;
    chatId: number;
    data: string;
    from?: (typeof telegramUsers)[keyof typeof telegramUsers];
  }) {
    return webhook(callbackUpdate({ chatId, data, from, messageId: card }));
  }

  function edits(card: number, chatId: number) {
    return api
      .of('editMessageText')
      .filter((body) => body.message_id === card && body.chat_id === String(chatId));
  }

  function lastToolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    server = await api.listen();

    vi.stubEnv('TELEGRAM_API_BASE_URL', server.url);

    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-telegram-questions-'));
    frogbot = await boot(directory);
  }, 30_000);

  beforeEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await server?.close();

    vi.unstubAllEnvs();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('continues the DM with the persisted answer and records nothing for a late tap', async () => {
    const chatId = telegramUsers.frog.id;
    const card = await ask({ chatId, toolCallId: 'call-dm' });

    expect(model.requests[0]!.tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(api.cards().at(-1)).toMatchObject({ chat_id: '42', parse_mode: 'HTML' });

    model.respond({ text: 'Painting it blue.' });

    await tap({ card, chatId, data: 'q:0:o:1' });

    expect(await settlements(chatId)).toMatchObject([
      [
        'call-dm',
        {
          outcome: 'answered',
          actor: {
            user: null,
            channel: { piece: 'telegramBot', account: 'telegramBot', id: '42', name: 'Frog Smith' },
          },
        },
      ],
    ]);
    expect(edits(card, chatId).at(-1)).toMatchObject({ reply_markup: { inline_keyboard: [] } });

    await run((await continuations(chatId))[0]);

    expect(lastToolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Blue'] }] }]);
    expect(JSON.stringify(api.calls)).toContain('Painting it blue.');

    const before = edits(card, chatId).length;

    await tap({ card, chatId, data: 'q:0:o:0' });

    expect(edits(card, chatId).slice(before)).toEqual([
      expect.objectContaining({ text: edits(card, chatId)[before - 1]!.text }),
    ]);
    expect(await continuations(chatId)).toHaveLength(1);
    expect(model.requests).toHaveLength(2);
  });

  it('settles once when two teammates tap at the same time', async () => {
    const chatId = -100701;
    const card = await ask({ chatId, toolCallId: 'call-race' });

    await Promise.all([
      tap({ card, chatId, data: 'q:0:o:0', from: telegramUsers.frog }),
      tap({ card, chatId, data: 'q:0:o:1', from: telegramUsers.toad }),
    ]);

    expect(await settlements(chatId)).toHaveLength(1);
    expect(await continuations(chatId)).toHaveLength(1);
    expect(new Set(edits(card, chatId).map(({ text }) => text)).size).toBe(1);
    expect(edits(card, chatId).at(-1)).toMatchObject({ reply_markup: { inline_keyboard: [] } });

    await run((await continuations(chatId))[0]);
  });

  it('turns a double submit of a typed answer into one settlement', async () => {
    const chatId = -100702;
    const card = await ask({ chatId, toolCallId: 'call-double' });

    await tap({ card, chatId, data: 'q:0:c' });

    const typed = messageUpdate({ chatId, from: telegramUsers.toad, replyTo: card, text: 'Teal' });

    await host().webhook('telegramBot', telegramWebhook(typed, { updateId: 70_001 }));
    await host().webhook('telegramBot', telegramWebhook(typed, { updateId: 70_001 }));
    await webhook({ message: { ...typed.message, message_id: typed.message.message_id + 1000 } });

    const queued = (await jobs(chatId)).filter((input) => input.kind !== 'continue').slice(-2);

    expect(queued).toHaveLength(2);

    model.respond({ text: 'Teal it is.' });

    await run(queued[0]);
    await run(queued[1]);

    expect(await settlements(chatId)).toMatchObject([
      ['call-double', { outcome: 'answered', actor: { channel: { id: '7' } } }],
    ]);
    expect(await continuations(chatId)).toHaveLength(1);

    await run((await continuations(chatId))[0]);

    expect(lastToolResults().at(-1)).toEqual({
      answers: [{ header: 'Color', selected: [], custom: 'Teal' }],
    });
    expect(model.requests).toHaveLength(2);
  });

  it('denies a participant outside the agent’s access policy and keeps the question open', async () => {
    const chatId = -100703;
    const card = await ask({ chatId, toolCallId: 'call-denied' });

    await tap({ card, chatId, data: 'q:0:o:0', from: telegramUsers.newt });

    expect(api.of('sendMessage').at(-1)).toMatchObject({
      text: "Newt, you don't have access to answer this question.",
      reply_parameters: { message_id: card },
    });
    expect(
      (await settlements(chatId)).filter(([toolCallId]) => toolCallId === 'call-denied'),
    ).toEqual([]);

    await tap({ card, chatId, data: 'q:0:o:1', from: telegramUsers.toad });

    expect(
      (await settlements(chatId)).filter(([toolCallId]) => toolCallId === 'call-denied'),
    ).toMatchObject([['call-denied', { outcome: 'answered', actor: { channel: { id: '7' } } }]]);

    await run((await continuations(chatId)).at(-1));
  });

  it('refuses a web answer and keeps the card answerable in Telegram', async () => {
    const chatId = -100705;
    const card = await ask({ chatId, toolCallId: 'call-web' });
    const req = await frogbot.createRequest({});

    await expect(
      settleClientToolCall({
        req,
        chatId: (await chatDoc(chatId)).id,
        toolCallId: 'call-web',
        outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
      }),
    ).rejects.toMatchObject({ status: 404 });

    const owner = await frogbot.create({
      collection: 'users',
      data: { email: 'frog@example.com', password: 'secret-password' },
      overrideAccess: true,
    });
    const chat = await chatDoc(chatId);

    await frogbot.update({
      collection: 'chats',
      id: chat.id,
      data: { user: owner.id },
      overrideAccess: true,
    });

    Object.assign(req, { user: { ...owner, collection: 'users' } });

    await expect(
      settleClientToolCall({
        req,
        chatId: chat.id,
        toolCallId: 'call-web',
        outcome: { dismissed: true },
      }),
    ).rejects.toMatchObject({
      code: 'channel-chat',
      status: 409,
      message:
        'This conversation happens in Telegram. Continue it there, or branch it into a new chat.',
    });

    expect(await settlements(chatId)).toEqual([]);
    expect(edits(card, chatId)).toEqual([]);

    await tap({ card, chatId, data: 'q:0:o:0' });

    expect(await settlements(chatId)).toMatchObject([['call-web', { outcome: 'answered' }]]);
    expect(String(edits(card, chatId).at(-1)?.text)).toContain('Answered by Frog Smith');
    expect(await continuations(chatId)).toHaveLength(1);

    await run((await continuations(chatId))[0]);
  });

  it('dismisses without continuing and lets the next message start a new turn', async () => {
    const chatId = telegramUsers.toad.id;
    const card = await ask({ chatId, toolCallId: 'call-dismiss' });

    await tap({ card, chatId, data: 'q:x', from: telegramUsers.toad });

    const req = await frogbot.createRequest({});

    expect(await settlements(chatId)).toMatchObject([['call-dismiss', { outcome: 'dismissed' }]]);
    expect(await continuations(chatId)).toEqual([]);
    expect(await findTurnState({ req, chatId: (await chatDoc(chatId)).id })).toBe('idle');
    expect(String(edits(card, chatId).at(-1)?.text)).toContain('🚫 Dismissed by Toad Hall');

    model.respond({ text: 'Starting over.' });

    await webhook(messageUpdate({ chatId, from: telegramUsers.toad, text: 'Try again' }));
    await run((await jobs(chatId)).at(-1));

    expect(model.requests).toHaveLength(2);
  });

  it('walks toggles, a typed reply, and a second question to exact labels in the next model call', async () => {
    const chatId = -100704;
    const card = await ask({
      chatId,
      toolCallId: 'call-form',
      input: {
        questions: [
          {
            header: 'Colors',
            question: 'Which colors?',
            options: [{ label: 'Red & <Rose>' }, { label: '*Blue*' }, { label: 'Grün' }],
            multiple: true,
            custom: true,
          },
          {
            header: 'Size',
            question: 'Which size?',
            options: [{ label: 'Small' }, { label: 'Large' }],
          },
        ],
      },
    });

    await tap({ card, chatId, data: 'q:0:t:2' });
    await tap({ card, chatId, data: 'q:0:t:0', from: telegramUsers.toad });
    await tap({ card, chatId, data: 'q:0:c' });
    await webhook(messageUpdate({ chatId, replyTo: card, text: 'Teal' }));
    await run((await jobs(chatId)).at(-1));

    expect(
      (await settlements(chatId)).filter(([toolCallId]) => toolCallId === 'call-form'),
    ).toEqual([]);

    model.respond({ text: 'Noted.' });

    await tap({ card, chatId, data: 'q:1:o:1', from: telegramUsers.toad });
    await run((await continuations(chatId)).at(-1));

    expect(lastToolResults().at(-1)).toEqual({
      answers: [
        { header: 'Colors', selected: ['Red & <Rose>', 'Grün'], custom: 'Teal' },
        { header: 'Size', selected: ['Large'] },
      ],
    });
  });

  it('holds an ordinary group message while a question is open and answers sibling calls one card at a time', async () => {
    const chatId = -100888;
    const size: QuestionInput = {
      questions: [
        { header: 'Size', question: 'Which size?', options: [{ label: 'S' }, { label: 'L' }] },
      ],
    };

    model.respond({
      toolCalls: [
        { id: 'call-a', name: 'question', input: colorQuestion },
        { id: 'call-b', name: 'question', input: size },
      ],
    });

    await webhook(messageUpdate({ chatId, text: '@frogbot paint it' }));
    await run((await jobs(chatId)).at(-1));

    const first = api.lastMessageId();

    await webhook(messageUpdate({ chatId, text: 'Make it matte' }));
    await run((await jobs(chatId)).at(-1));

    expect(model.requests).toHaveLength(1);

    await tap({ card: first, chatId, data: 'q:0:o:0' });

    const second = api.lastMessageId();

    expect(second).not.toBe(first);
    expect(api.cards().at(-1)!.text).toContain('Size');
    expect(await continuations(chatId)).toEqual([]);

    model.respond({ text: 'Red, small.' }, { text: 'Matte noted.' });

    await tap({ card: second, chatId, data: 'q:0:o:0' });
    await run((await continuations(chatId))[0]);

    expect(lastToolResults()).toEqual([
      { answers: [{ header: 'Color', selected: ['Red'] }] },
      { answers: [{ header: 'Size', selected: ['S'] }] },
    ]);

    await run((await jobs(chatId)).find((input) => input.kind === 'promote'));

    expect(JSON.stringify(model.requests.at(-1)!.messages)).toContain('Make it matte');
  });

  it('keeps a pending card answerable after the server restarts', async () => {
    const chatId = -100999;
    const card = await ask({ chatId, toolCallId: 'call-restart' });

    await frogbot.destroy();

    frogbot = await boot(directory);

    model.respond({ text: 'Red after restart.' });

    await tap({ card, chatId, data: 'q:0:o:0' });

    expect(await continuations(chatId)).toHaveLength(1);

    await run((await continuations(chatId))[0]);

    expect(lastToolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Red'] }] }]);
  });
});
