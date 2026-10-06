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
import { createLinear } from '../../../../packages/pieces/piece-linear/src/index.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';
import { testPort } from '../../../__helpers/shared/testPorts.js';
import {
  type LinearApi,
  linearRequest,
  redirectLinearFetch,
  sessionCreated,
  sessionPrompted,
  startLinearApi,
} from './linearFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const webhookSecret = 'linear-questions-database-secret';
const modelPort = testPort(3987);
const frog = { id: 'linear-frog', name: 'Frog', email: 'frog@example.com' };
const toad = { id: 'linear-toad', name: 'Toad', email: 'toad@example.com' };
const stranger = { id: 'linear-stranger', name: 'Stranger', email: 'stranger@example.com' };

type LinearUser = typeof frog;

const colorQuestion: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color?',
      options: [{ label: 'Red' }, { label: 'Blue', description: 'Calm' }],
      custom: true,
    },
  ],
};

const sizeQuestion: QuestionInput = {
  questions: [
    {
      header: 'Size',
      question: 'Which size?',
      options: [{ label: 'Small' }, { label: 'Large' }],
      custom: true,
    },
  ],
};

let promptId = 0;

async function boot(directory: string): Promise<FrogBot> {
  const config = await buildConfig({
    secret: 'linear-questions-test-secret',
    db: sqliteAdapter({ client: { url: `file:${directory}/linear.db` }, push: true }),
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
        channels: [createLinear({ auth: { accessToken: 'linear-token' }, webhookSecret })],
      },
      {
        slug: 'open',
        model: 'test/gpt-4.1-mini',
        instructions: 'Ask before acting.',
        tools: [question],
        channels: [
          createLinear({
            slug: 'linear-open',
            auth: { accessToken: 'linear-token' },
            webhookSecret,
          }),
        ],
        access: () => true,
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

describe('Linear questions with SQLite persistence', () => {
  let api: LinearApi;
  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;

  const threadId = (session: string) => `linear:issue-1:s:${session}`;

  async function jobs(session: string): Promise<ChannelTaskInput[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs
      .map((job) => job.input as ChannelTaskInput)
      .filter((input) => input.thread.id === threadId(session));
  }

  async function continuations(session: string) {
    return (await jobs(session)).filter((input) => input.kind === 'continue');
  }

  async function chatId(session: string) {
    const result = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });

    const chat = result.docs.find(
      (doc) =>
        (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id ===
        threadId(session),
    );

    return chat!.id;
  }

  async function settlements(session: string) {
    const result = await frogbot.find({
      collection: 'messages',
      where: {
        and: [{ chat: { equals: await chatId(session) } }, { role: { equals: 'assistant' } }],
      },
      sort: 'createdAt',
      overrideAccess: true,
    });

    return result.docs.flatMap((doc) =>
      Object.entries(
        (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
      ),
    );
  }

  function activities(session: string) {
    return api.sessionActivities(session).map(({ input }) => input);
  }

  async function run(input: ChannelTaskInput) {
    await getChannelHost(frogbot)!.run(JSON.parse(JSON.stringify(input)));
  }

  async function ask({
    input = colorQuestion,
    instance = 'linear',
    session,
    toolCallId,
  }: {
    input?: QuestionInput;
    instance?: string;
    session: string;
    toolCallId: string;
  }) {
    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await getChannelHost(frogbot)!.webhook(
      instance,
      linearRequest({ payload: sessionCreated({ session, user: frog }), secret: webhookSecret }),
    );

    const [message] = await jobs(session);

    await run(message);
  }

  async function deliver({
    body,
    id = `prompt-${++promptId}`,
    instance = 'linear',
    session,
    signal,
    user = toad,
  }: {
    body: string;
    id?: string;
    instance?: string;
    session: string;
    signal?: string;
    user?: LinearUser;
  }) {
    const before = (await jobs(session)).length;

    const response = await getChannelHost(frogbot)!.webhook(
      instance,
      linearRequest({
        payload: sessionPrompted({ body, id, session, signal, user }),
        secret: webhookSecret,
      }),
    );

    expect(response?.status).toBe(200);

    return (await jobs(session)).slice(before);
  }

  async function reply(options: Parameters<typeof deliver>[0]) {
    const queued = await deliver(options);

    await Promise.all(queued.map(run));
  }

  async function runContinuation(session: string) {
    const [continuation] = (await continuations(session)).slice(-1);

    await run(continuation);
  }

  function toolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    api = await startLinearApi({ users: [frog, toad, stranger] });

    vi.stubGlobal('fetch', redirectLinearFetch({ apiUrl: api.url, fetch: globalThis.fetch }));

    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-linear-questions-'));
    frogbot = await boot(directory);

    for (const { email } of [frog, toad]) {
      await frogbot.create({
        collection: 'users',
        data: { email, password: 'secret-password' },
        overrideAccess: true,
      });
    }
  }, 30_000);

  beforeEach(() => {
    model.reset();
    api.reset();
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await api?.close();

    vi.unstubAllGlobals();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('continues the same session with a teammate’s persisted answer and asks again', async () => {
    const session = 'session-answer';

    await ask({ session, toolCallId: 'call-color' });

    expect(model.requests[0].tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(activities(session)).toEqual([
      {
        agentSessionId: session,
        content: {
          type: 'elicitation',
          body: '**Color**\nWhich color?\n\n- **Red**\n- **Blue** — Calm\n\nChoose an option, or reply with your own answer.',
        },
        signal: 'select',
        signalMetadata: {
          options: [
            { label: 'Red', value: 'Red' },
            { label: 'Blue', value: 'Blue' },
          ],
        },
      },
    ]);

    model.respond({ toolCalls: [{ id: 'call-size', name: 'question', input: sizeQuestion }] });

    await reply({ body: 'Blue', session });

    expect(await settlements(session)).toMatchObject([
      [
        'call-color',
        {
          outcome: 'answered',
          actor: {
            user: { collection: 'users' },
            channel: { piece: 'linear', account: 'linear', id: toad.id, name: 'Toad' },
          },
        },
      ],
    ]);
    expect(await continuations(session)).toMatchObject([{ responder: { userId: toad.id } }]);
    expect(model.requests).toHaveLength(1);

    await runContinuation(session);

    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Blue'] }] }]);
    expect(activities(session).map(({ content }) => content.type)).toEqual([
      'elicitation',
      'elicitation',
    ]);
    expect(activities(session)[1].content.body).toContain('**Size**');

    model.respond({ text: 'Painting a large blue button.' });

    await reply({ body: 'large', session });
    await runContinuation(session);

    expect(toolResults()).toEqual([
      { answers: [{ header: 'Color', selected: ['Blue'] }] },
      { answers: [{ header: 'Size', selected: ['Large'] }] },
    ]);
    expect(activities(session).at(-1)!.content).toEqual({
      type: 'response',
      body: 'Painting a large blue button.',
    });
  });

  it('continues several questions answered on one line each with exact labels and text', async () => {
    const session = 'session-several';

    await ask({
      session,
      toolCallId: 'call-form',
      input: {
        questions: [
          {
            header: 'Colors',
            question: 'Which colors?',
            options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
            multiple: true,
            custom: false,
          },
          { ...sizeQuestion.questions[0] },
        ],
      },
    });

    expect(activities(session)[0]).not.toHaveProperty('signal');

    await reply({ body: '3, 1\nExtra large', session });
    await runContinuation(session);

    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Colors', selected: ['Red', 'Green'] },
          { header: 'Size', selected: [], custom: 'Extra large' },
        ],
      },
    ]);
  });

  it('stops on a Linear stop request without calling the model again', async () => {
    const session = 'session-stop';

    await ask({ session, toolCallId: 'call-stop' });
    await reply({ body: '', session, signal: 'stop' });

    const req = await frogbot.createRequest({});

    expect(await settlements(session)).toMatchObject([['call-stop', { outcome: 'dismissed' }]]);
    expect(await continuations(session)).toEqual([]);
    expect(await findTurnState({ req, chatId: await chatId(session) })).toBe('idle');
    expect(activities(session).at(-1)!.content).toEqual({
      type: 'response',
      body: 'Stopped. Toad dismissed the question.',
    });
    expect(model.requests).toHaveLength(1);
  });

  it('denies a Linear user with no FrogBot account and keeps the question open', async () => {
    const session = 'session-denied';

    await ask({ session, toolCallId: 'call-denied' });
    await reply({ body: 'Red', session, user: stranger });

    expect(await settlements(session)).toEqual([]);
    expect(activities(session)).toHaveLength(2);
    expect(activities(session)[1]).toMatchObject({
      content: {
        body: expect.stringMatching(/^> Stranger can't answer this question without access/),
      },
      signal: 'select',
    });

    await reply({ body: 'Blue', session });

    expect(await settlements(session)).toMatchObject([
      ['call-denied', { outcome: 'answered', actor: { channel: { id: toad.id } } }],
    ]);
  });

  it('accepts a Linear user with no FrogBot account when the agent’s access allows them', async () => {
    const session = 'session-open';

    await ask({ instance: 'linear-open', session, toolCallId: 'call-open' });
    await reply({ body: 'Red', instance: 'linear-open', session, user: stranger });

    expect(await settlements(session)).toMatchObject([
      ['call-open', { outcome: 'answered', actor: { user: null, channel: { id: stranger.id } } }],
    ]);

    await runContinuation(session);

    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Red'] }] }]);
  });

  it('settles once when Linear delivers the same prompt twice', async () => {
    const session = 'session-double';

    await ask({ session, toolCallId: 'call-double' });

    const first = await deliver({ body: 'Red', id: 'prompt-double', session });
    const second = await deliver({ body: 'Red', id: 'prompt-double', session });

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);

    await run(first[0]);

    expect(await settlements(session)).toHaveLength(1);
    expect(await continuations(session)).toHaveLength(1);
  });

  it('settles once and queues one continuation when two people answer at the same time', async () => {
    const session = 'session-race';

    await ask({ session, toolCallId: 'call-race' });

    const before = (await jobs(session)).length;
    const host = getChannelHost(frogbot)!;

    await Promise.all(
      [
        { body: 'Red', user: frog },
        { body: 'Blue', user: toad },
      ].map(({ body, user }) =>
        host.webhook(
          'linear',
          linearRequest({
            payload: sessionPrompted({ body, id: `prompt-${++promptId}`, session, user }),
            secret: webhookSecret,
          }),
        ),
      ),
    );

    const queued = (await jobs(session)).slice(before);

    expect(queued).toHaveLength(2);

    await Promise.all(queued.map(run));

    expect(await settlements(session)).toHaveLength(1);
    expect(await continuations(session)).toHaveLength(1);
    expect(activities(session).slice(1)).toEqual([
      {
        agentSessionId: session,
        content: { type: 'response', body: 'This question was already answered.' },
      },
    ]);
  });

  it('answers a late option with stale and runs a free-text follow-up as a new turn', async () => {
    const session = 'session-stale';

    await ask({ session, toolCallId: 'call-stale' });

    model.respond({ text: 'Red it is.' });

    await reply({ body: 'Red', session });
    await runContinuation(session);

    expect(model.requests).toHaveLength(2);

    await reply({ body: 'blue', session, user: frog });

    expect(activities(session).at(-1)!.content).toEqual({
      type: 'response',
      body: 'This question was already answered.',
    });
    expect(await settlements(session)).toHaveLength(1);
    expect(model.requests).toHaveLength(2);

    model.respond({ text: 'Rounding the corners.' });

    await reply({ body: 'Now round the corners', session });

    expect(model.requests).toHaveLength(3);
    expect(JSON.stringify(model.requests[2].messages)).toContain('Now round the corners');
    expect(activities(session).at(-1)!.content).toEqual({
      type: 'response',
      body: 'Rounding the corners.',
    });
  });

  it('holds free text sent before the continuation runs and promotes it afterwards', async () => {
    const session = 'session-held';

    await ask({ session, toolCallId: 'call-held' });
    await reply({ body: 'Red', session });

    const before = (await jobs(session)).length;

    await reply({ body: 'Make it matte', session, user: frog });

    expect(model.requests).toHaveLength(1);

    model.respond({ text: 'Red, noted.' }, { text: 'Matte it is.' });

    await runContinuation(session);

    const promotion = (await jobs(session)).slice(before).find(({ kind }) => kind === 'promote');

    expect(promotion).toBeDefined();
    expect(model.requests).toHaveLength(2);
    expect(JSON.stringify(model.requests[1].messages)).not.toContain('Make it matte');

    await run(promotion!);

    expect(JSON.stringify(model.requests[2].messages)).toContain('Make it matte');
    expect(activities(session).at(-1)!.content).toEqual({ type: 'response', body: 'Matte it is.' });
  });

  it('refuses a web answer and keeps the question answerable in Linear', async () => {
    const session = 'session-web';

    await ask({ session, toolCallId: 'call-web' });

    const owner = await frogbot.find({
      collection: 'users',
      where: { email: { equals: frog.email } },
      overrideAccess: true,
    });
    const req = await frogbot.createRequest({});

    Object.assign(req, { user: { ...owner.docs[0], collection: 'users' } });

    await expect(
      settleClientToolCall({
        req,
        chatId: await chatId(session),
        toolCallId: 'call-web',
        outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
      }),
    ).rejects.toMatchObject({ code: 'channel-chat', status: 409 });

    expect(await settlements(session)).toEqual([]);
    expect(activities(session)).toHaveLength(1);

    model.respond({ text: 'Red from Linear.' });

    await reply({ body: 'Red', session });
    await runContinuation(session);

    expect(await settlements(session)).toMatchObject([['call-web', { outcome: 'answered' }]]);
    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Red'] }] }]);
  });

  it('keeps a pending question answerable after the server restarts', async () => {
    const session = 'session-restart';

    await ask({ session, toolCallId: 'call-restart' });
    await frogbot.destroy();

    frogbot = await boot(directory);

    model.respond({ text: 'Blue after restart.' });

    await reply({ body: 'Blue', session });

    expect(await continuations(session)).toHaveLength(1);

    await runContinuation(session);

    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Blue'] }] }]);
    expect(activities(session).at(-1)!.content).toEqual({
      type: 'response',
      body: 'Blue after restart.',
    });
  });
});
