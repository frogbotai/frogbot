import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BasePayload } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { createGithub } from '../../../../packages/pieces/piece-github/src/index.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';
import {
  assertGithubTraffic,
  type GithubApi,
  githubApp,
  type GithubPerson,
  githubWebhookSecret,
  issueComment,
  issuePath,
  nextCommentId,
  redirectGithub,
  startGithubApi,
} from './githubFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const modelPort = 3997;

const alice: GithubPerson = { id: 41, login: 'alice', email: 'alice@example.com' };
const bob: GithubPerson = { id: 42, login: 'bob', email: 'bob@example.com' };
const carol: GithubPerson = { id: 43, login: 'carol' };
const mallory: GithubPerson = { id: 66, login: 'mallory' };

const colorQuestion: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color?',
      options: [{ label: 'Red *hot*' }, { label: 'Blue_ish' }],
      custom: true,
    },
  ],
};

const order: QuestionInput = {
  questions: [
    {
      header: 'Size',
      question: 'Which size?',
      options: [{ label: 'Small' }, { label: 'Large' }],
      custom: false,
    },
    {
      header: 'Toppings',
      question: 'Which toppings?',
      options: [{ label: 'Basil' }, { label: 'Olives' }, { label: 'Chili & honey' }],
      multiple: true,
      custom: false,
    },
    {
      header: 'Notes',
      question: 'Anything else?',
      options: [{ label: 'Nothing' }],
      custom: true,
    },
  ],
};

async function boot(directory: string): Promise<FrogBot> {
  const options = { webhookSecret: githubWebhookSecret, botUsername: 'frogbot', botUserId: 99 };

  const config = await buildConfig({
    secret: 'github-questions-test-secret',
    telemetry: false,
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
        channels: [createGithub({ auth: githubApp, ...options })],
      },
      {
        slug: 'open',
        model: 'test/gpt-4.1-mini',
        instructions: 'Ask before acting.',
        tools: [question],
        channels: [createGithub({ slug: 'github-open', auth: githubApp, ...options })],
        access: ({ req }) => ['41', '43'].includes(req.context?.channel?.author.id ?? ''),
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

describe('GitHub questions with SQLite persistence', () => {
  let api: GithubApi;
  let blocked: string[];
  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;

  const host = () => getChannelHost(frogbot)!;
  const threadId = (issue: number) => `github:frogbotai/frogbot:issue:${issue}`;

  async function jobs(issue: number): Promise<ChannelTaskInput[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs
      .map((job) => job.input as ChannelTaskInput)
      .filter((input) => input.thread.id === threadId(issue));
  }

  async function continuations(issue: number) {
    return (await jobs(issue)).filter((input) => input.kind === 'continue');
  }

  async function run(input: ChannelTaskInput | undefined) {
    await host().run(JSON.parse(JSON.stringify(input)));
  }

  async function chatId(issue: number) {
    const result = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });

    const chat = result.docs.find(
      (doc) =>
        (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id === threadId(issue),
    );

    return chat!.id;
  }

  async function settlements(issue: number) {
    const result = await frogbot.find({
      collection: 'messages',
      where: {
        and: [{ chat: { equals: await chatId(issue) } }, { role: { equals: 'assistant' } }],
      },
      overrideAccess: true,
    });

    return result.docs.flatMap((doc) =>
      Object.entries(
        (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
      ),
    );
  }

  function comments(issue: number) {
    return api.posts(issuePath(issue));
  }

  function bodies(issue: number) {
    return comments(issue).map(({ body }) => body);
  }

  async function ask({
    input = colorQuestion,
    instance = 'github',
    issue,
    toolCallId,
  }: {
    input?: QuestionInput;
    instance?: string;
    issue: number;
    toolCallId: string;
  }) {
    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await host().webhook(
      instance,
      issueComment({ body: '@frogbot plan it', issue, person: alice }),
    );

    await run((await jobs(issue))[0]);

    return comments(issue).at(-1)!;
  }

  async function deliver({
    id,
    instance = 'github',
    issue,
    body,
    person = bob,
  }: {
    id?: number;
    instance?: string;
    issue: number;
    body: string;
    person?: GithubPerson;
  }): Promise<ChannelTaskInput | undefined> {
    const before = (await jobs(issue)).length;

    await host().webhook(instance, issueComment({ body, id, issue, person }));

    return (await jobs(issue))[before];
  }

  async function say(args: Parameters<typeof deliver>[0]) {
    const input = await deliver(args);

    if (input) await run(input);
  }

  function toolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    api = await startGithubApi({ people: [alice, bob, carol, mallory] });

    const redirect = redirectGithub({ api, fetch: globalThis.fetch });

    blocked = redirect.blocked;
    vi.stubGlobal('fetch', redirect.fetch);

    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-github-questions-'));
    frogbot = await boot(directory);

    await Promise.all(
      [alice, bob].map(({ email }) =>
        frogbot.create({
          collection: 'users',
          data: { email: email!, password: 'github-questions' },
          overrideAccess: true,
        }),
      ),
    );
  }, 30_000);

  beforeEach(() => {
    model.reset();
  });

  afterEach(() => {
    assertGithubTraffic({ api, blocked });
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await api?.close();

    vi.unstubAllGlobals();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('continues the same issue with a teammate’s persisted answer', async () => {
    const issue = 101;
    const asked = await ask({ issue, toolCallId: 'call-1' });

    expect(model.requests[0]!.tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(bodies(issue)).toEqual([asked.body]);
    expect(asked.body).toContain('1. **Red \\*hot\\***\n2. **Blue\\_ish**');

    model.respond({ text: 'Painting it blue.' });

    await say({ issue, body: '/answer 2' });

    expect(await settlements(issue)).toMatchObject([
      [
        'call-1',
        {
          outcome: 'answered',
          actor: {
            user: { collection: 'users', id: expect.anything() },
            channel: { piece: 'github', account: 'github', id: '42', username: 'bob' },
          },
        },
      ],
    ]);
    expect(api.edits(asked.id)[0]!.body).toContain('Answered by `@bob`');
    expect(await continuations(issue)).toMatchObject([{ responder: { userName: 'bob' } }]);

    await run((await continuations(issue))[0]);

    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Blue_ish'] }] }]);
    expect(bodies(issue).at(-1)).toBe('Painting it blue.');
  });

  it('settles once and continues once when two teammates answer at the same time', async () => {
    const issue = 102;
    const asked = await ask({ issue, toolCallId: 'call-race' });

    const first = await deliver({ issue, body: '/answer 1', person: alice });
    const second = await deliver({ issue, body: '/answer 2', person: bob });

    await Promise.all([run(first), run(second)]);

    expect(await settlements(issue)).toHaveLength(1);
    expect(await continuations(issue)).toHaveLength(1);
    expect(api.edits(asked.id)).toHaveLength(1);
    expect(bodies(issue).slice(1)).toEqual([
      expect.stringMatching(
        /^`@(alice|bob)` This question was already answered by `@(alice|bob)`\.$/,
      ),
    ]);
    expect(model.requests).toHaveLength(1);
  });

  it('ignores a redelivered comment and tells a second answer it is too late', async () => {
    const issue = 103;

    await ask({ issue, toolCallId: 'call-replay' });

    const id = nextCommentId();

    await say({ issue, body: '/answer 1', id });
    await say({ issue, body: '/answer 1', id });
    await say({ issue, body: '/answer 2', person: alice });

    expect(await settlements(issue)).toHaveLength(1);
    expect(await continuations(issue)).toHaveLength(1);
    expect(bodies(issue).at(-1)).toBe('`@alice` This question was already answered by `@bob`.');
    expect(model.requests).toHaveLength(1);
  });

  it('tells a commenter without a matching FrogBot user they have no access and keeps the question open', async () => {
    const issue = 104;
    const asked = await ask({ issue, toolCallId: 'call-denied' });

    await say({ issue, body: '/answer 1', person: mallory });
    await say({ issue, body: 'please pick red', person: mallory });

    expect(bodies(issue).slice(1)).toEqual([
      "`@mallory` doesn't have access to answer this question.",
    ]);
    expect(api.edits(asked.id)).toEqual([]);
    expect(await settlements(issue)).toEqual([]);
    expect(model.requests).toHaveLength(1);

    await say({ issue, body: '/answer 1' });

    expect(await settlements(issue)).toMatchObject([
      ['call-denied', { outcome: 'answered', actor: { channel: { username: 'bob' } } }],
    ]);
  });

  it('lets an operator’s access policy admit a commenter by GitHub user ID, attributed without a user', async () => {
    const issue = 105;

    await ask({ instance: 'github-open', issue, toolCallId: 'call-open' });
    await say({ instance: 'github-open', issue, body: '/answer "Teal"', person: carol });

    expect(await settlements(issue)).toMatchObject([
      [
        'call-open',
        {
          outcome: 'answered',
          actor: { user: null, channel: { piece: 'github', id: '43', username: 'carol' } },
        },
      ],
    ]);

    await run((await continuations(issue))[0]);

    expect(toolResults()).toEqual([
      { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] },
    ]);
  });

  it('dismisses without continuing and lets the next comment start a new turn', async () => {
    const issue = 106;
    const asked = await ask({ issue, toolCallId: 'call-dismiss' });

    await say({ issue, body: '/dismiss' });

    const req = await frogbot.createRequest({});

    expect(await settlements(issue)).toMatchObject([['call-dismiss', { outcome: 'dismissed' }]]);
    expect(await continuations(issue)).toEqual([]);
    expect(await findTurnState({ req, chatId: await chatId(issue) })).toBe('idle');
    expect(api.edits(asked.id)[0]!.body).toContain('<sub>Dismissed by `@bob`</sub>');

    model.respond({ text: 'Starting over.' });

    await say({ issue, body: 'Try again with green' });

    expect(model.requests).toHaveLength(2);
    expect(bodies(issue).at(-1)).toBe('Starting over.');
  });

  it('walks a question set across a restart and continues with every exact label', async () => {
    const issue = 107;
    const first = await ask({ input: order, issue, toolCallId: 'call-order' });

    await say({ issue, body: '/answer 2', person: alice });

    const second = comments(issue).at(-1)!;

    expect(second.body).toContain('### Toppings · Question 2 of 3');
    expect(api.edits(first.id)[0]!.body).toContain('✅ **Large**');

    const racing = nextCommentId();

    await frogbot.destroy();

    frogbot = await boot(directory);

    await say({ issue, body: '/answer 3, 1' });
    await say({ issue, body: '/answer 1', id: racing, person: alice });

    const third = comments(issue).find(({ body }) => body.includes('Question 3 of 3'))!;

    expect(bodies(issue)).toContain(
      '`@alice` That reply was for an earlier question. Answer question 3 of 3 instead.',
    );

    model.respond({ text: 'Large, basil and chili.' });

    await say({ issue, body: '/answer "No onions, please"' });

    expect(await settlements(issue)).toMatchObject([
      ['call-order', { outcome: 'answered', actor: { channel: { username: 'bob' } } }],
    ]);
    expect(api.edits(second.id).at(-1)!.body).toContain('✅ **Basil, Chili \\& honey**');
    expect(api.edits(third.id).at(-1)!.body).toContain('✅ **“No onions, please”**');

    await run((await continuations(issue))[0]);

    expect(toolResults()).toEqual([
      {
        answers: [
          { header: 'Size', selected: ['Large'] },
          { header: 'Toppings', selected: ['Basil', 'Chili & honey'] },
          { header: 'Notes', selected: [], custom: 'No onions, please' },
        ],
      },
    ]);
    expect(bodies(issue).at(-1)).toBe('Large, basil and chili.');
  });

  it('keeps a posted question answerable after the server restarts', async () => {
    const issue = 108;
    const asked = await ask({ issue, toolCallId: 'call-restart' });

    await frogbot.destroy();

    frogbot = await boot(directory);

    model.respond({ text: 'Red after restart.' });

    await say({ issue, body: '/answer 1' });
    await run((await continuations(issue))[0]);

    expect(api.edits(asked.id)[0]!.body).toContain('✅ **Red \\*hot\\***');
    expect(toolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Red *hot*'] }] }]);
    expect(bodies(issue).at(-1)).toBe('Red after restart.');
  });

  it('refuses a web answer and keeps the question answerable in GitHub', async () => {
    const issue = 109;
    const asked = await ask({ issue, toolCallId: 'call-web' });
    const [user] = (
      await frogbot.find({
        collection: 'users',
        where: { email: { equals: 'alice@example.com' } },
        overrideAccess: true,
      })
    ).docs;
    const req = await frogbot.createRequest({});

    Object.assign(req, { user: { ...user, collection: 'users' } });

    await expect(
      settleClientToolCall({
        req,
        chatId: await chatId(issue),
        toolCallId: 'call-web',
        outcome: { output: { answers: [{ header: 'Color', selected: ['Blue_ish'] }] } },
      }),
    ).rejects.toMatchObject({ code: 'channel-chat', status: 409 });

    expect(await settlements(issue)).toEqual([]);
    expect(api.edits(asked.id)).toEqual([]);

    await say({ issue, body: '/answer 1' });

    expect(await settlements(issue)).toMatchObject([['call-web', { outcome: 'answered' }]]);
  });
});
