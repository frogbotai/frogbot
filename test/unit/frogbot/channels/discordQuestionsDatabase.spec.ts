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
import { findTurnState } from '../../../../packages/frogbot/src/chat/turn/state.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { type FrogBot, initFrogBotFromPayload } from '../../../../packages/frogbot/src/frogbot.js';
import { question, type QuestionInput } from '../../../../packages/frogbot/src/tools/question.js';
import { createDiscord } from '../../../../packages/pieces/piece-discord/src/index.js';
import {
  callKey,
  encodeQuestionId,
} from '../../../../packages/pieces/piece-discord/src/questions/ids.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';
import {
  componentClick,
  type DiscordApi,
  discordApplicationId,
  discordBotToken,
  discordPublicKey,
  forwardedGateway,
  gatewayMessage,
  signedInteraction,
  snowflake,
  startDiscordApi,
} from './discordFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const modelPort = 3994;
const allowed = ['U1', 'U2', 'U3'];

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

function control({
  n,
  q = 0,
  toolCallId,
  verb,
}: {
  n?: number;
  q?: number;
  toolCallId: string;
  verb: Parameters<typeof encodeQuestionId>[0]['verb'];
}) {
  return encodeQuestionId({ key: callKey(toolCallId), q, verb, n });
}

async function boot({ api, directory }: { api: DiscordApi; directory: string }): Promise<FrogBot> {
  const options = {
    apiUrl: api.url,
    applicationId: discordApplicationId,
    publicKey: discordPublicKey,
  };

  const config = await buildConfig({
    secret: 'discord-questions-test-secret',
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
        channels: [createDiscord({ auth: { botToken: discordBotToken }, ...options })],
        access: ({ req }) => allowed.includes(req.context?.channel?.author.id ?? ''),
      },
      {
        slug: 'closed',
        model: 'test/gpt-4.1-mini',
        instructions: 'Ask before acting.',
        tools: [question],
        channels: [
          createDiscord({
            slug: 'discord-closed',
            auth: { botToken: discordBotToken },
            ...options,
          }),
        ],
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

describe('Discord questions with SQLite persistence', () => {
  let api: DiscordApi;
  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;

  const host = () => getChannelHost(frogbot)!;

  async function jobs(threadId: string): Promise<ChannelTaskInput[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs
      .map((job) => job.input as ChannelTaskInput)
      .filter((input) => input.thread.id === `discord:G1:C1:${threadId}`);
  }

  async function continuations(threadId: string) {
    return (await jobs(threadId)).filter((input) => input.kind === 'continue');
  }

  async function run(input: ChannelTaskInput | undefined) {
    await host().run(JSON.parse(JSON.stringify(input)));
  }

  async function chatId(threadId: string) {
    const result = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });

    const chat = result.docs.find(
      (doc) =>
        (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id ===
        `discord:G1:C1:${threadId}`,
    );

    return chat!.id;
  }

  async function settlements(threadId: string) {
    const result = await frogbot.find({
      collection: 'messages',
      where: {
        and: [{ chat: { equals: await chatId(threadId) } }, { role: { equals: 'assistant' } }],
      },
      overrideAccess: true,
    });

    return result.docs.flatMap((doc) =>
      Object.entries(
        (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
      ),
    );
  }

  function notices(threadId: string) {
    return api.calls
      .filter(
        ({ method, path, body }) =>
          method === 'POST' && path === `/channels/${threadId}/messages` && body.message_reference,
      )
      .map(({ body }) => body.content);
  }

  function posted(threadId: string) {
    return JSON.stringify(
      api.calls
        .filter(({ path }) => path.startsWith(`/channels/${threadId}/messages`))
        .map(({ body }) => body.content ?? null),
    );
  }

  async function ask({
    input = colorQuestion,
    instance = 'discord',
    threadId,
    toolCallId,
  }: {
    input?: QuestionInput;
    instance?: string;
    threadId: string;
    toolCallId: string;
  }): Promise<string> {
    api.parents.set(threadId, 'C1');
    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await host().webhook(
      instance,
      forwardedGateway({
        body: gatewayMessage({ content: 'Paint it', mention: true, starter: true, threadId }),
      }),
    );

    await run((await jobs(threadId))[0]);

    return api.cards(threadId).at(-1)!.id!;
  }

  function click({
    instance = 'discord',
    ...args
  }: {
    instance?: string;
    customId: string;
    id?: string;
    messageId: string;
    threadId: string;
    user?: string;
    values?: string[];
  }) {
    return host().webhook(instance, signedInteraction({ body: componentClick(args) }));
  }

  async function say({
    content,
    threadId,
    user = 'U2',
  }: {
    content: string;
    threadId: string;
    user?: string;
  }) {
    const before = (await jobs(threadId)).length;

    await host().webhook(
      'discord',
      forwardedGateway({ body: gatewayMessage({ content, threadId, user }) }),
    );

    await run((await jobs(threadId))[before]);
  }

  function toolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    api = await startDiscordApi();
    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-discord-questions-'));
    frogbot = await boot({ api, directory });
  }, 30_000);

  beforeEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await api?.close();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('continues the same Discord thread with a teammate’s persisted answer', async () => {
    const threadId = 'T101';
    const card = await ask({ threadId, toolCallId: 'call-1' });

    expect(model.requests[0]!.tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(api.cards(threadId)[0]!.body).toMatchObject({ flags: 32768 });
    expect(JSON.stringify(api.cards(threadId)[0]!.body)).toContain(
      control({ toolCallId: 'call-1', verb: 'option', n: 1 }),
    );

    model.respond({ text: 'Painting it blue.' });

    const response = await click({
      customId: control({ toolCallId: 'call-1', verb: 'option', n: 1 }),
      messageId: card,
      threadId,
    });

    expect(await response?.json()).toEqual({ type: 6 });
    expect(await settlements(threadId)).toMatchObject([
      [
        'call-1',
        {
          outcome: 'answered',
          actor: { user: null, channel: { piece: 'discord', account: 'discord', id: 'U2' } },
        },
      ],
    ]);
    expect(JSON.stringify(api.edits(threadId, card)[0]!.body)).toContain('Answered by **User U2**');
    expect(await continuations(threadId)).toMatchObject([{ responder: { userId: 'U2' } }]);

    await run((await continuations(threadId))[0]);

    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Blue'] }] }]);
    expect(posted(threadId)).toContain('Painting it blue.');
  });

  it('settles once and continues once when two teammates click at the same time', async () => {
    const threadId = 'T102';
    const card = await ask({ threadId, toolCallId: 'call-race' });

    await Promise.all([
      click({
        customId: control({ toolCallId: 'call-race', verb: 'option', n: 0 }),
        messageId: card,
        threadId,
        user: 'U1',
      }),
      click({
        customId: control({ toolCallId: 'call-race', verb: 'option', n: 1 }),
        messageId: card,
        threadId,
        user: 'U2',
      }),
    ]);

    expect(await settlements(threadId)).toHaveLength(1);
    expect(await continuations(threadId)).toHaveLength(1);
    expect(api.edits(threadId, card)).toHaveLength(1);
  });

  it('ignores a replayed click and a double submit', async () => {
    const threadId = 'T103';
    const card = await ask({ threadId, toolCallId: 'call-replay' });
    const id = snowflake();
    const customId = control({ toolCallId: 'call-replay', verb: 'option', n: 0 });

    await click({ customId, id, messageId: card, threadId });

    const before = api.calls.length;

    await click({ customId, id, messageId: card, threadId });
    await click({ customId, messageId: card, threadId });

    expect(await settlements(threadId)).toHaveLength(1);
    expect(await continuations(threadId)).toHaveLength(1);
    expect(api.calls.slice(before)).toEqual([]);
  });

  it('denies a participant the agent’s access does not admit and keeps the question open', async () => {
    const threadId = 'T104';
    const card = await ask({ threadId, toolCallId: 'call-denied' });

    await click({
      customId: control({ toolCallId: 'call-denied', verb: 'option', n: 0 }),
      messageId: card,
      threadId,
      user: 'U9',
    });
    await click({
      customId: control({ toolCallId: 'call-denied', verb: 'custom' }),
      messageId: card,
      threadId,
      user: 'U9',
    });

    expect(notices(threadId)).toEqual([
      "<@U9> You don't have access to answer this question.",
      "<@U9> You don't have access to answer this question.",
    ]);
    expect(api.edits(threadId, card)).toEqual([]);
    expect(await settlements(threadId)).toEqual([]);

    await click({
      customId: control({ toolCallId: 'call-denied', verb: 'option', n: 1 }),
      messageId: card,
      threadId,
      user: 'U3',
    });

    expect(await settlements(threadId)).toMatchObject([
      ['call-denied', { outcome: 'answered', actor: { channel: { id: 'U3' } } }],
    ]);
  });

  it('dismisses without continuing and lets the next message start a new turn', async () => {
    const threadId = 'T105';
    const card = await ask({ threadId, toolCallId: 'call-dismiss' });

    await click({
      customId: control({ toolCallId: 'call-dismiss', verb: 'dismiss' }),
      messageId: card,
      threadId,
    });

    const req = await frogbot.createRequest({});

    expect(await settlements(threadId)).toMatchObject([['call-dismiss', { outcome: 'dismissed' }]]);
    expect(await continuations(threadId)).toEqual([]);
    expect(await findTurnState({ req, chatId: await chatId(threadId) })).toBe('idle');
    expect(JSON.stringify(api.edits(threadId, card)[0]!.body)).toContain(
      'Dismissed by **User U2**',
    );

    model.respond({ text: 'Starting over.' });

    await say({ content: 'Try again', threadId });

    expect(model.requests).toHaveLength(2);
    expect(posted(threadId)).toContain('Starting over.');
  });

  it('changes nothing when a retired card or an earlier step is clicked', async () => {
    const threadId = 'T106';
    const toolCallId = 'call-stale';
    const card = await ask({
      threadId,
      toolCallId,
      input: {
        questions: [
          { header: 'Color', question: 'Color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
          { header: 'Size', question: 'Size?', options: [{ label: 'S' }, { label: 'L' }] },
        ],
      },
    });

    await click({
      customId: control({ toolCallId, verb: 'option', n: 0 }),
      messageId: card,
      threadId,
    });

    const advanced = api.calls.length;

    await click({
      customId: control({ toolCallId, verb: 'option', n: 1 }),
      messageId: card,
      threadId,
      user: 'U3',
    });

    expect(api.calls.slice(advanced)).toEqual([]);

    model.respond({ text: 'Red and large.' });

    await click({
      customId: control({ toolCallId, q: 1, verb: 'option', n: 1 }),
      messageId: card,
      threadId,
    });
    await run((await continuations(threadId))[0]);

    const settled = api.calls.length;

    await click({
      customId: control({ toolCallId, q: 1, verb: 'option', n: 0 }),
      messageId: card,
      threadId,
      user: 'U3',
    });

    expect(api.calls.slice(settled)).toEqual([]);
    expect(await settlements(threadId)).toHaveLength(1);
    expect(await continuations(threadId)).toHaveLength(1);
    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Color', selected: ['Red'] },
          { header: 'Size', selected: ['L'] },
        ],
      },
    ]);
  });

  it('continues a question set with a multi-select, a typed answer, and exact labels', async () => {
    const threadId = 'T107';
    const toolCallId = 'call-set';
    const card = await ask({
      threadId,
      toolCallId,
      input: {
        questions: [
          {
            header: 'Colors',
            question: 'Which colors?',
            options: [{ label: 'Red' }, { label: 'Blue & Teal' }, { label: 'Green (dark)' }],
            multiple: true,
            custom: false,
          },
          {
            header: 'Size',
            question: 'Which size?',
            options: [{ label: 'Small' }, { label: 'Large' }],
            custom: true,
          },
        ],
      },
    });

    await click({
      customId: control({ toolCallId, verb: 'select', n: 0 }),
      messageId: card,
      threadId,
      values: ['2', '1'],
    });
    await click({ customId: control({ toolCallId, verb: 'submit' }), messageId: card, threadId });

    expect(JSON.stringify(api.edits(threadId, card).at(-1)!.body)).toContain('**Size** · 2 of 2');

    await click({
      customId: control({ toolCallId, q: 1, verb: 'custom' }),
      messageId: card,
      threadId,
    });

    model.respond({ text: 'Noted.' });

    await say({ content: 'Extra large', threadId });

    expect(await continuations(threadId)).toHaveLength(1);

    await run((await continuations(threadId))[0]);

    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Colors', selected: ['Blue & Teal', 'Green (dark)'] },
          { header: 'Size', selected: [], custom: 'Extra large' },
        ],
      },
    ]);
    expect(model.requests).toHaveLength(2);
  });

  it('holds a bystander’s message sent while someone is typing and runs it after the answer', async () => {
    const threadId = 'T108';
    const toolCallId = 'call-held';
    const card = await ask({ threadId, toolCallId });

    await click({ customId: control({ toolCallId, verb: 'custom' }), messageId: card, threadId });
    await say({ content: 'Make it matte', threadId, user: 'U3' });

    expect(await settlements(threadId)).toEqual([]);
    expect(model.requests).toHaveLength(1);

    model.respond({ text: 'Teal it is.' }, { text: 'Replying to your note.' });

    await say({ content: 'Teal', threadId });
    await run((await continuations(threadId))[0]);

    const promotion = (await jobs(threadId)).find((input) => input.kind === 'promote');

    await run(promotion);

    expect(toolResults()).toEqual([
      { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] },
    ]);
    expect(JSON.stringify(model.requests[1]!.messages)).not.toContain('Make it matte');
    expect(JSON.stringify(model.requests[2]!.messages)).toContain('Make it matte');
    expect(posted(threadId)).toContain('Replying to your note.');
  });

  it('keeps a pending card answerable after the server restarts', async () => {
    const threadId = 'T109';
    const card = await ask({ threadId, toolCallId: 'call-restart' });

    await frogbot.destroy();

    frogbot = await boot({ api, directory });

    model.respond({ text: 'Red after restart.' });

    await click({
      customId: control({ toolCallId: 'call-restart', verb: 'option', n: 0 }),
      messageId: card,
      threadId,
    });

    expect(await continuations(threadId)).toHaveLength(1);

    await run((await continuations(threadId))[0]);

    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Red'] }] }]);
    expect(posted(threadId)).toContain('Red after restart.');
  });

  it('denies everyone under the default agent access, as the docs warn', async () => {
    const threadId = 'T110';

    api.parents.set(threadId, 'C1');

    await host().webhook(
      'discord-closed',
      forwardedGateway({
        body: gatewayMessage({ content: 'Paint it', mention: true, starter: true, threadId }),
      }),
    );

    await run((await jobs(threadId))[0]);

    expect(model.requests).toEqual([]);
    expect(api.cards(threadId)).toEqual([]);
  });
});
