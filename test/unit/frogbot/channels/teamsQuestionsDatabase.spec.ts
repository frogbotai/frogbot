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
import { createMicrosoftTeams } from '../../../../packages/pieces/piece-microsoft-teams/src/index.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';
import {
  botAppId,
  botAppPassword,
  cardInputs,
  cardOf,
  members,
  mentionActivity,
  startTeamsServer,
  submitActivity,
  teamsActivity,
  type TeamsMember,
  type TeamsServer,
  textRuns,
} from './teamsFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const modelPort = 3996;

const colorQuestion: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should the fence be?',
      options: [{ label: 'Red, barn' }, { label: 'Blue' }],
      custom: true,
    },
  ],
};

let teams: TeamsServer;

function teamsInstance(slug: string) {
  return createMicrosoftTeams({
    slug,
    auth: { appId: botAppId, appPassword: botAppPassword },
    botApiUrl: teams.url,
  });
}

async function boot(directory: string): Promise<FrogBot> {
  const config = await buildConfig({
    secret: 'teams-questions-test-secret',
    db: sqliteAdapter({ client: { url: `file:${directory}/teams.db` }, push: true }),
    typescript: { autoGenerate: false },
    admin: { user: 'users', importMap: { autoGenerate: false } },
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
        channels: [teamsInstance('teams')],
      },
      {
        slug: 'open',
        model: 'test/gpt-4.1-mini',
        instructions: 'Ask before acting.',
        tools: [question],
        channels: [teamsInstance('teams-open')],
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

function conversationOf(threadId: string) {
  return Buffer.from(threadId.split(':')[1]!, 'base64url').toString();
}

describe('Teams questions with SQLite persistence', () => {
  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;
  let ada: { id: string | number };

  const conversation = (root: string) => `19:general@thread.tacv2;messageid=${root}`;

  const host = () => getChannelHost(frogbot)!;

  async function jobs(root: string): Promise<ChannelTaskInput[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs
      .map((job) => job.input as ChannelTaskInput)
      .filter((input) => conversationOf(input.thread.id) === conversation(root));
  }

  async function continuations(root: string) {
    return (await jobs(root)).filter((input) => input.kind === 'continue');
  }

  async function chatId(root: string) {
    const result = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });

    const chat = result.docs.find((doc) => {
      const id = (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id;

      return id && conversationOf(id) === conversation(root);
    });

    return chat!.id;
  }

  async function settlements(root: string) {
    const result = await frogbot.find({
      collection: 'messages',
      where: {
        and: [{ chat: { equals: await chatId(root) } }, { role: { equals: 'assistant' } }],
      },
      overrideAccess: true,
    });

    return result.docs.flatMap((doc) =>
      Object.entries(
        (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
      ),
    );
  }

  const inThread = (root: string) => (request: { conversationId?: string }) =>
    request.conversationId === conversation(root);

  const cards = (root: string) => teams.cards().filter(inThread(root));

  const updates = (root: string) => teams.updates().filter(inThread(root));

  const notices = (root: string) =>
    teams
      .targeted()
      .filter(inThread(root))
      .map(({ body }) => ({ user: body.recipient?.id, text: body.text }));

  const replies = (root: string) =>
    teams.requests
      .filter(inThread(root))
      .filter(({ method, targeted, body }) => method === 'POST' && !targeted && body.text)
      .map(({ body }) => body.text as string);

  async function mention({
    instance = 'teams',
    root,
    text,
    id = root,
    from = members.ada,
  }: {
    instance?: string;
    root: string;
    text?: string;
    id?: string;
    from?: TeamsMember;
  }) {
    return host().webhook(
      instance,
      teams.signed(mentionActivity({ id, root, from, text, serviceUrl: teams.serviceUrl })),
    );
  }

  async function ask({
    input = colorQuestion,
    instance = 'teams',
    root,
    toolCallId,
  }: {
    input?: QuestionInput;
    instance?: string;
    root: string;
    toolCallId: string;
  }): Promise<string> {
    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await mention({ instance, root });

    const [message] = await jobs(root);

    await host().run(JSON.parse(JSON.stringify(message)));

    return cards(root).at(-1)!.sentId!;
  }

  function submit({
    action,
    card,
    from = members.grace,
    id,
    instance = 'teams',
    root,
    toolCallId,
    values,
  }: {
    action?: 'submit' | 'dismiss';
    card?: string;
    from?: TeamsMember;
    id?: string;
    instance?: string;
    root: string;
    toolCallId: string;
    values?: Record<string, string>;
  }) {
    return host().webhook(
      instance,
      teams.signed(
        submitActivity({
          action,
          card,
          from,
          id,
          root,
          serviceUrl: teams.serviceUrl,
          toolCallId,
          values,
        }),
      ),
    );
  }

  async function runContinuation(root: string) {
    const [continuation] = await continuations(root);

    await host().run(JSON.parse(JSON.stringify(continuation)));
  }

  function lastToolResults() {
    return model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));
  }

  beforeAll(async () => {
    teams = await startTeamsServer();
    teams.interceptLogin();

    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-teams-questions-'));
    frogbot = await boot(directory);

    ada = await frogbot.create({
      collection: 'users',
      data: { email: 'ada@example.com', password: 'secret-password' },
      overrideAccess: true,
    });

    await frogbot.create({
      collection: 'users',
      data: { email: 'grace@example.com', password: 'secret-password' },
      overrideAccess: true,
    });
  }, 30_000);

  beforeEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await teams?.close();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('continues the same Teams thread with a teammate’s persisted answer', async () => {
    const root = '1001';
    const card = await ask({ root, toolCallId: 'call-1' });

    expect(model.requests[0]!.tools?.map(({ function: tool }) => tool.name)).toContain('question');
    expect(replies(root)).toEqual([]);
    expect(cardInputs(cards(root)[0])[0]!.choices).toEqual([
      { title: 'Red, barn', value: '0' },
      { title: 'Blue', value: '1' },
    ]);

    model.respond({ text: 'Painting it red.' });

    await submit({ card, root, toolCallId: 'call-1', values: { 'question-0': '0' } });

    expect(await settlements(root)).toMatchObject([
      [
        'call-1',
        {
          outcome: 'answered',
          actor: {
            user: { collection: 'users' },
            channel: {
              piece: 'microsoft-teams',
              account: 'teams',
              id: '29:grace',
              name: 'Grace Hopper',
            },
          },
        },
      ],
    ]);
    expect(cardInputs(updates(root).at(-1))).toEqual([]);
    expect(JSON.stringify(cardOf(updates(root).at(-1)))).toContain('Answered by Grace Hopper');
    expect(await continuations(root)).toMatchObject([
      { responder: { userId: '29:grace', email: 'grace@example.com' } },
    ]);

    await runContinuation(root);

    expect(lastToolResults()).toEqual([
      { answers: [{ header: 'Color', selected: ['Red, barn'] }] },
    ]);
    expect(replies(root)).toEqual(['Painting it red.']);
  });

  it('settles a double submit and a redelivered activity once', async () => {
    const root = '1002';
    const card = await ask({ root, toolCallId: 'call-double' });
    const values = { 'question-0': '1' };

    await submit({ card, id: 'submit-twice', root, toolCallId: 'call-double', values });
    await submit({ card, id: 'submit-twice', root, toolCallId: 'call-double', values });
    await submit({ card, root, toolCallId: 'call-double', values });

    expect(await settlements(root)).toHaveLength(1);
    expect(await continuations(root)).toHaveLength(1);
    expect(notices(root)).toEqual([
      { user: '29:grace', text: 'This question was already answered.' },
      { user: '29:grace', text: 'This question was already answered.' },
    ]);
  });

  it('settles once when two teammates submit at the same time', async () => {
    const root = '1003';
    const card = await ask({ root, toolCallId: 'call-race' });

    await Promise.all([
      submit({
        card,
        from: members.ada,
        root,
        toolCallId: 'call-race',
        values: { 'question-0': '0' },
      }),
      submit({ card, root, toolCallId: 'call-race', values: { 'question-0': '1' } }),
    ]);

    const settled = updates(root).filter((update) => cardInputs(update).length === 0);

    expect(await settlements(root)).toHaveLength(1);
    expect(await continuations(root)).toHaveLength(1);
    expect(settled.length).toBeGreaterThanOrEqual(1);
    expect(notices(root)).toEqual([
      {
        user: expect.stringMatching(/^29:(ada|grace)$/),
        text: 'This question was already answered.',
      },
    ]);
  });

  it('denies a responder whose Teams email has no FrogBot user and keeps the question open', async () => {
    const root = '1004';
    const card = await ask({ root, toolCallId: 'call-denied' });

    await submit({
      card,
      from: members.mallory,
      root,
      toolCallId: 'call-denied',
      values: { 'question-0': '0' },
    });

    expect(notices(root)).toEqual([
      { user: '29:mallory', text: "You don't have access to answer this question." },
    ]);
    expect(updates(root)).toEqual([]);
    expect(await settlements(root)).toEqual([]);
    expect(await continuations(root)).toEqual([]);

    await submit({ card, root, toolCallId: 'call-denied', values: { 'question-0': '1' } });

    expect(await settlements(root)).toMatchObject([
      ['call-denied', { outcome: 'answered', actor: { channel: { id: '29:grace' } } }],
    ]);
  });

  it('accepts an unmatched responder when the agent’s access allows them', async () => {
    const root = '1005';
    const card = await ask({ instance: 'teams-open', root, toolCallId: 'call-open' });

    model.respond({ text: 'Blue it is.' });

    await submit({
      card,
      from: members.guest,
      instance: 'teams-open',
      root,
      toolCallId: 'call-open',
      values: { 'question-0': '1' },
    });

    expect(await settlements(root)).toMatchObject([
      ['call-open', { outcome: 'answered', actor: { user: null, channel: { id: '29:guest' } } }],
    ]);

    await runContinuation(root);

    expect(lastToolResults()).toEqual([{ answers: [{ header: 'Color', selected: ['Blue'] }] }]);
  });

  it('shows the stored answer on a card that was answered elsewhere', async () => {
    const root = '1006';
    const card = await ask({ root, toolCallId: 'call-web' });
    const req = await frogbot.createRequest({});

    Object.assign(req, { user: { ...ada, collection: 'users' } });

    await settleClientToolCall({
      req,
      chatId: await chatId(root),
      toolCallId: 'call-web',
      outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
    });

    await submit({ card, root, toolCallId: 'call-web', values: { 'question-0': '0' } });

    const [update] = updates(root);

    expect(JSON.stringify(cardOf(update))).toContain('✅ Blue');
    expect(cardInputs(update)).toEqual([]);
    expect(notices(root)).toEqual([
      { user: '29:grace', text: 'This question was already answered.' },
    ]);
    expect(await continuations(root)).toEqual([]);
  });

  it('dismisses without continuing and lets the next message start a new turn', async () => {
    const root = '1007';
    const card = await ask({ root, toolCallId: 'call-dismiss' });

    await submit({ action: 'dismiss', card, root, toolCallId: 'call-dismiss' });

    const req = await frogbot.createRequest({});

    expect(await settlements(root)).toMatchObject([['call-dismiss', { outcome: 'dismissed' }]]);
    expect(await continuations(root)).toEqual([]);
    expect(await findTurnState({ req, chatId: await chatId(root) })).toBe('idle');
    expect(JSON.stringify(cardOf(updates(root).at(-1)))).toContain('Dismissed by Grace Hopper');

    model.respond({ text: 'Starting over.' });

    await mention({ root, id: '1107' });
    await host().run(JSON.parse(JSON.stringify((await jobs(root)).at(-1))));

    expect(model.requests).toHaveLength(2);
    expect(replies(root)).toEqual(['Starting over.']);
  });

  it('asks sibling questions one card at a time and continues once with both answers', async () => {
    const root = '1008';

    model.respond({
      toolCalls: [
        { id: 'call-a', name: 'question', input: colorQuestion },
        {
          id: 'call-b',
          name: 'question',
          input: {
            questions: [
              {
                header: 'Size',
                question: 'Which size?',
                options: [{ label: 'S' }, { label: 'L' }],
              },
            ],
          },
        },
      ],
    });

    await mention({ root });
    await host().run(JSON.parse(JSON.stringify((await jobs(root))[0])));

    expect(cards(root)).toHaveLength(1);

    await submit({
      card: cards(root)[0]!.sentId,
      root,
      toolCallId: 'call-a',
      values: { 'question-0': '1' },
    });

    expect(cards(root)).toHaveLength(2);
    expect(cardOf(cards(root)[1])!.actions![0]!.data).toMatchObject({ value: 'call-b' });
    expect(await continuations(root)).toEqual([]);

    model.respond({ text: 'Blue, large.' });

    await submit({
      card: cards(root)[1]!.sentId,
      root,
      toolCallId: 'call-b',
      values: { 'question-0-text': 'Extra large' },
    });

    expect(await continuations(root)).toHaveLength(1);

    await runContinuation(root);

    expect(lastToolResults()).toEqual([
      { answers: [{ header: 'Color', selected: ['Blue'] }] },
      { answers: [{ header: 'Size', selected: [], custom: 'Extra large' }] },
    ]);
    expect(replies(root)).toEqual(['Blue, large.']);
  });

  it('continues a multi-question card with exact labels and a typed answer', async () => {
    const root = '1009';

    const card = await ask({
      root,
      toolCallId: 'call-form',
      input: {
        questions: [
          {
            header: 'Colors',
            question: 'Which colors?',
            options: [{ label: 'Red' }, { label: 'Blue, navy' }, { label: 'Green' }],
            multiple: true,
            custom: false,
          },
          {
            header: 'Size',
            question: 'Which size?',
            options: [{ label: 'Small' }, { label: 'Large' }],
          },
        ],
      },
    });

    await submit({ card, root, toolCallId: 'call-form', values: { 'question-0': '2,1' } });

    expect(await settlements(root)).toEqual([]);
    expect(textRuns(cardOf(updates(root).at(-1))!.body).at(-1)).toMatchObject({
      text: 'Answer “Size” before submitting.',
    });

    model.respond({ text: 'Noted.' });

    await submit({
      card,
      root,
      toolCallId: 'call-form',
      values: { 'question-0': '2,1', 'question-1': '0', 'question-1-text': 'Extra large' },
    });

    await runContinuation(root);

    expect(lastToolResults()).toEqual([
      {
        answers: [
          { header: 'Colors', selected: ['Blue, navy', 'Green'] },
          { header: 'Size', selected: [], custom: 'Extra large' },
        ],
      },
    ]);
  });

  it('holds a thread message sent while a card is open and runs it after the answer', async () => {
    const root = '1010';
    const card = await ask({ root, toolCallId: 'call-held' });

    await host().webhook(
      'teams',
      teams.signed(
        teamsActivity({
          id: '1110',
          root,
          text: 'Make it matte',
          serviceUrl: teams.serviceUrl,
        }),
      ),
    );
    await host().run(JSON.parse(JSON.stringify((await jobs(root)).at(-1))));

    expect(model.requests).toHaveLength(1);
    expect(await settlements(root)).toEqual([]);

    model.respond({ text: 'Red, and I read your note.' }, { text: 'Replying to your note.' });

    await submit({ card, root, toolCallId: 'call-held', values: { 'question-0': '0' } });
    await runContinuation(root);

    const promotion = (await jobs(root)).find((input) => input.kind === 'promote');

    await host().run(JSON.parse(JSON.stringify(promotion)));

    expect(JSON.stringify(model.requests[1]!.messages)).not.toContain('Make it matte');
    expect(JSON.stringify(model.requests[2]!.messages)).toContain('Make it matte');
    expect(replies(root)).toEqual(['Red, and I read your note.', 'Replying to your note.']);
  });

  it('keeps a pending card answerable after the server restarts', async () => {
    const root = '1011';
    const card = await ask({ root, toolCallId: 'call-restart' });

    await frogbot.destroy();

    frogbot = await boot(directory);

    model.respond({ text: 'Red after restart.' });

    await submit({ card, root, toolCallId: 'call-restart', values: { 'question-0': '0' } });

    expect(await continuations(root)).toHaveLength(1);

    await runContinuation(root);

    expect(lastToolResults()).toEqual([
      { answers: [{ header: 'Color', selected: ['Red, barn'] }] },
    ]);
    expect(replies(root)).toEqual(['Red after restart.']);
  });
});
