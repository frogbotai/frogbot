import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

import { BasePayload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import {
  CHANNEL_TASK_SLUG,
  getChannelHost,
} from '../../../../packages/frogbot/src/channels/host.js';
import type { ChannelTaskInput } from '../../../../packages/frogbot/src/channels/types.js';
import { findTurnState } from '../../../../packages/frogbot/src/chat/turn/state.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { type FrogBot, initFrogBotFromPayload } from '../../../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { question, type QuestionInput } from '../../../../packages/frogbot/src/tools/question.js';
import { createSlackAdapter } from '../../../../packages/pieces/piece-slack/node_modules/@chat-adapter/slack/dist/index.js';
import { slackQuestions } from '../../../../packages/pieces/piece-slack/src/questions/index.js';
import { startStubChatModel, type StubChatModel } from '../../../__helpers/shared/StubChatModel.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

type SlackCall = { method: string; body: Record<string, unknown>; ts: string };

const signingSecret = 'questions-database-secret';
const modelPort = 3993;
const slackCalls: SlackCall[] = [];
let slackTs = 0;
let eventId = 0;

const slack = createServer(async (req, res) => {
  const raw = await text(req);
  const ts = `2.${String(++slackTs).padStart(6, '0')}`;

  slackCalls.push({
    method: req.url!.slice(1),
    body: raw.startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)),
    ts,
  });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ts, channel: 'C1', message: {} }));
});

function slackURL() {
  return `http://127.0.0.1:${(slack.address() as AddressInfo).port}/`;
}

function signed(body: string, contentType: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex');

  return new Request('http://localhost/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': contentType,
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': `v0=${signature}`,
    },
  });
}

function interaction(payload: Record<string, unknown>) {
  return signed(
    `payload=${encodeURIComponent(JSON.stringify(payload))}`,
    'application/x-www-form-urlencoded',
  );
}

function mention({
  message = 'Paint it',
  thread,
  ts = thread,
  user = 'U1',
}: {
  message?: string;
  thread: string;
  ts?: string;
  user?: string;
}) {
  return signed(
    JSON.stringify({
      type: 'event_callback',
      event_id: `Ev${++eventId}`,
      team_id: 'T1',
      event: {
        type: 'app_mention',
        channel: 'C1',
        ts,
        ...(ts === thread ? {} : { thread_ts: thread }),
        text: message,
        user,
      },
    }),
    'application/json',
  );
}

function click({
  actionId,
  card,
  state,
  thread,
  user = 'U2',
  value,
}: {
  actionId: string;
  card: string;
  state?: object;
  thread: string;
  user?: string;
  value?: string;
}) {
  return interaction({
    type: 'block_actions',
    trigger_id: `trigger-${card}`,
    user: { id: user, username: user.toLowerCase(), name: user },
    channel: { id: 'C1' },
    container: { type: 'message', channel_id: 'C1', message_ts: card },
    message: { ts: card, thread_ts: thread },
    actions: [{ action_id: actionId, ...(value === undefined ? {} : { value }) }],
    ...(state ? { state } : {}),
  });
}

function submitView({
  blockId,
  metadata,
  user = 'U2',
  value,
}: {
  blockId: string;
  metadata: string;
  user?: string;
  value: string;
}) {
  return interaction({
    type: 'view_submission',
    user: { id: user, username: user.toLowerCase(), name: user },
    view: {
      id: 'V1',
      callback_id: 'frogbot:question:custom',
      private_metadata: metadata,
      state: { values: { [blockId]: { answer: { type: 'plain_text_input', value } } } },
    },
  });
}

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

function createSlackPiece() {
  return definePiece({
    slug: 'slack',
    label: 'Slack',
    auth: z.object({ token: z.string() }),
    client: () => ({
      async request(method: string, body: Record<string, unknown>) {
        const response = await fetch(`${slackURL()}${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

        return response.json();
      },
    }),
    actions: [],
    channel: {
      adapter: () =>
        createSlackAdapter({
          botToken: 'xoxb-test',
          botUserId: 'UBOT',
          signingSecret,
          apiUrl: slackURL(),
          nativeStreaming: false,
          webClientOptions: { retryConfig: { retries: 0 } },
        }),
      async identity({ author, req }) {
        const result = await req.frogbot.find({
          collection: 'users',
          where: { slackId: { equals: author.userId } },
          overrideAccess: true,
        });

        return result.docs[0] ? { ...result.docs[0], collection: 'users' } : null;
      },
      questions: slackQuestions as never,
    },
  });
}

async function boot(directory: string): Promise<FrogBot> {
  const slackPiece = createSlackPiece();

  const config = await buildConfig({
    secret: 'channel-questions-test-secret',
    db: sqliteAdapter({ client: { url: `file:${directory}/questions.db` }, push: true }),
    typescript: { autoGenerate: false },
    admin: { importMap: { autoGenerate: false } },
    collections: [
      { slug: 'users', auth: true, fields: [{ name: 'slackId', type: 'text' }] },
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
        channels: [slackPiece({ auth: { token: 'secret' } })],
      },
      {
        slug: 'open',
        model: 'test/gpt-4.1-mini',
        instructions: 'Ask before acting.',
        tools: [question],
        channels: [slackPiece({ slug: 'slack-open', auth: { token: 'secret' } })],
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

describe('Slack questions with SQLite persistence', () => {
  let directory: string;
  let frogbot: FrogBot;
  let model: StubChatModel;

  async function jobs(thread: string): Promise<ChannelTaskInput[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: CHANNEL_TASK_SLUG } },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs
      .map((job) => job.input as ChannelTaskInput)
      .filter((input) => input.thread.id === `slack:C1:${thread}`);
  }

  async function continuations(thread: string) {
    return (await jobs(thread)).filter((input) => input.kind === 'continue');
  }

  async function chatId(thread: string) {
    const result = await frogbot.find({ collection: 'chats', limit: 0, overrideAccess: true });

    const chat = result.docs.find(
      (doc) =>
        (doc.channelThread as { thread?: { id?: string } } | null)?.thread?.id ===
        `slack:C1:${thread}`,
    );

    return chat!.id;
  }

  async function settlements(thread: string) {
    const result = await frogbot.find({
      collection: 'messages',
      where: {
        and: [{ chat: { equals: await chatId(thread) } }, { role: { equals: 'assistant' } }],
      },
      overrideAccess: true,
    });

    return result.docs.flatMap((doc) =>
      Object.entries(
        (doc.settlements ?? {}) as Record<string, { outcome: string; actor: unknown }>,
      ),
    );
  }

  function cards(thread: string) {
    return slackCalls.filter(
      ({ method, body }) =>
        method === 'chat.postMessage' && body.blocks && body.thread_ts === thread,
    );
  }

  function ephemerals(thread: string) {
    return slackCalls
      .filter(({ method, body }) => method === 'chat.postEphemeral' && body.thread_ts === thread)
      .map(({ body }) => ({ user: body.user, text: body.text }));
  }

  async function ask({
    input = colorQuestion,
    instance = 'slack',
    thread,
    toolCallId,
  }: {
    input?: QuestionInput;
    instance?: string;
    thread: string;
    toolCallId: string;
  }): Promise<string> {
    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await getChannelHost(frogbot)!.webhook(instance, mention({ thread }));

    const [message] = await jobs(thread);

    await getChannelHost(frogbot)!.run(JSON.parse(JSON.stringify(message)));

    return cards(thread).at(-1)!.ts;
  }

  async function runContinuation(thread: string) {
    const [continuation] = await continuations(thread);

    await getChannelHost(frogbot)!.run(JSON.parse(JSON.stringify(continuation)));
  }

  function lastToolResult() {
    const request = model.requests.at(-1)!;
    const result = request.messages.filter(({ role }) => role === 'tool').at(-1);

    return JSON.parse(String(result?.content));
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => slack.listen(0, '127.0.0.1', resolve));

    model = await startStubChatModel(modelPort);
    directory = await mkdtemp(join(tmpdir(), 'frogbot-channel-questions-'));
    frogbot = await boot(directory);

    await frogbot.create({
      collection: 'users',
      data: { email: 'toad@example.com', password: 'secret-password', slackId: 'U2' },
      overrideAccess: true,
    });
    await frogbot.create({
      collection: 'users',
      data: { email: 'frog@example.com', password: 'secret-password', slackId: 'U1' },
      overrideAccess: true,
    });
  }, 30_000);

  beforeEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await model?.close();
    await new Promise<void>((resolve) => slack.close(() => resolve()));

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('continues the same Slack thread with a teammate’s persisted answer', async () => {
    const thread = '1.000001';
    const card = await ask({ thread, toolCallId: 'call-1' });

    expect(JSON.stringify(cards(thread)[0]!.body.blocks)).toContain(
      'frogbot:question:choose:call-1:0:0',
    );
    expect(model.requests[0]!.tools?.map(({ function: tool }) => tool.name)).toContain('question');

    model.respond({ text: 'Painting it red.' });

    await getChannelHost(frogbot)!.webhook(
      'slack',
      click({ actionId: 'frogbot:question:choose:call-1:0:0', card, thread, value: '0' }),
    );

    expect(await settlements(thread)).toMatchObject([
      [
        'call-1',
        {
          outcome: 'answered',
          actor: { channel: { piece: 'slack', account: 'slack', id: 'U2' } },
        },
      ],
    ]);
    expect(await continuations(thread)).toMatchObject([{ responder: { userId: 'U2' } }]);

    await runContinuation(thread);

    expect(lastToolResult()).toEqual({ answers: [{ header: 'Color', selected: ['Red'] }] });
    expect(JSON.stringify(slackCalls.map(({ body }) => body))).toContain('Painting it red.');

    await getChannelHost(frogbot)!.webhook(
      'slack',
      click({ actionId: 'frogbot:question:choose:call-1:0:1', card, thread, value: '1' }),
    );

    expect(slackCalls.at(-1)).toMatchObject({
      method: 'chat.postEphemeral',
      body: { text: 'This question was already answered.' },
    });
    expect(model.requests).toHaveLength(2);
  });

  it('settles once and queues one continuation when two teammates click at the same time', async () => {
    const thread = '1.000002';
    const card = await ask({ thread, toolCallId: 'call-race' });
    const host = getChannelHost(frogbot)!;

    await Promise.all([
      host.webhook(
        'slack',
        click({
          actionId: 'frogbot:question:choose:call-race:0:0',
          card,
          thread,
          user: 'U1',
          value: '0',
        }),
      ),
      host.webhook(
        'slack',
        click({
          actionId: 'frogbot:question:choose:call-race:0:1',
          card,
          thread,
          user: 'U2',
          value: '1',
        }),
      ),
    ]);

    const settled = await settlements(thread);
    const updates = slackCalls.filter(
      ({ method, body }) => method === 'chat.update' && body.ts === card,
    );

    expect(settled).toHaveLength(1);
    expect(await continuations(thread)).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(ephemerals(thread)).toEqual([
      { user: expect.any(String), text: 'This question was already answered.' },
    ]);
  });

  it('dismisses without continuing and lets the next message start a new turn', async () => {
    const thread = '1.000003';
    const card = await ask({ thread, toolCallId: 'call-dismiss' });
    const host = getChannelHost(frogbot)!;

    await host.webhook(
      'slack',
      click({ actionId: 'frogbot:question:dismiss:call-dismiss', card, thread }),
    );

    const req = await frogbot.createRequest({});
    const update = slackCalls.filter(({ method }) => method === 'chat.update').at(-1);

    expect(await settlements(thread)).toMatchObject([['call-dismiss', { outcome: 'dismissed' }]]);
    expect(await continuations(thread)).toEqual([]);
    expect(await findTurnState({ req, chatId: await chatId(thread) })).toBe('idle');
    expect(JSON.stringify(update?.body.blocks)).toContain('Dismissed by <@U2>');
    expect(model.requests).toHaveLength(1);

    model.respond({ text: 'Starting over.' });

    await host.webhook('slack', mention({ thread, ts: '1.100003' }));

    const next = (await jobs(thread)).at(-1)!;

    await host.run(JSON.parse(JSON.stringify(next)));

    expect(model.requests).toHaveLength(2);
    expect(JSON.stringify(slackCalls.map(({ body }) => body))).toContain('Starting over.');
  });

  it('denies an unmatched Slack user under default agent access and keeps the question open', async () => {
    const thread = '1.000004';
    const card = await ask({ thread, toolCallId: 'call-denied' });

    await getChannelHost(frogbot)!.webhook(
      'slack',
      click({
        actionId: 'frogbot:question:choose:call-denied:0:0',
        card,
        thread,
        user: 'U9',
        value: '0',
      }),
    );

    expect(ephemerals(thread)).toEqual([
      { user: 'U9', text: "You don't have access to answer this question." },
    ]);
    expect(await settlements(thread)).toEqual([]);
    expect(await continuations(thread)).toEqual([]);

    await getChannelHost(frogbot)!.webhook(
      'slack',
      click({ actionId: 'frogbot:question:choose:call-denied:0:1', card, thread, value: '1' }),
    );

    expect(await settlements(thread)).toMatchObject([
      ['call-denied', { outcome: 'answered', actor: { channel: { id: 'U2' } } }],
    ]);
  });

  it('accepts an unmatched Slack user when the agent’s access allows them', async () => {
    const thread = '1.000005';
    const card = await ask({ instance: 'slack-open', thread, toolCallId: 'call-open' });

    model.respond({ text: 'Blue it is.' });

    await getChannelHost(frogbot)!.webhook(
      'slack-open',
      click({
        actionId: 'frogbot:question:choose:call-open:0:1',
        card,
        thread,
        user: 'U9',
        value: '1',
      }),
    );

    expect(await settlements(thread)).toMatchObject([
      ['call-open', { outcome: 'answered', actor: { user: null, channel: { id: 'U9' } } }],
    ]);

    await runContinuation(thread);

    expect(lastToolResult()).toEqual({ answers: [{ header: 'Color', selected: ['Blue'] }] });
  });

  it('asks sibling questions one card at a time and continues once after the last answer', async () => {
    const thread = '1.000006';

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

    const host = getChannelHost(frogbot)!;

    await host.webhook('slack', mention({ thread }));
    await host.run(JSON.parse(JSON.stringify((await jobs(thread))[0])));

    const first = cards(thread);

    expect(first).toHaveLength(1);

    await host.webhook(
      'slack',
      click({
        actionId: 'frogbot:question:choose:call-a:0:1',
        card: first[0]!.ts,
        thread,
        value: '1',
      }),
    );

    const second = cards(thread);

    expect(second).toHaveLength(2);
    expect(JSON.stringify(second[1]!.body.blocks)).toContain('frogbot:question:choose:call-b:0:1');
    expect(await continuations(thread)).toEqual([]);

    model.respond({ text: 'Blue, large.' });

    await host.webhook(
      'slack',
      click({
        actionId: 'frogbot:question:choose:call-b:0:1',
        card: second[1]!.ts,
        thread,
        value: '1',
      }),
    );

    expect(await continuations(thread)).toHaveLength(1);

    await runContinuation(thread);

    const results = model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .map(({ content }) => JSON.parse(String(content)));

    expect(results).toEqual([
      { answers: [{ header: 'Color', selected: ['Blue'] }] },
      { answers: [{ header: 'Size', selected: ['L'] }] },
    ]);
  });

  it('continues a multi-question form with exact labels and a typed answer', async () => {
    const thread = '1.000007';
    const host = getChannelHost(frogbot)!;

    const card = await ask({
      thread,
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
          {
            header: 'Size',
            question: 'Which size?',
            options: [{ label: 'Small' }, { label: 'Large' }],
            custom: true,
          },
        ],
      },
    });

    await host.webhook(
      'slack',
      click({ actionId: 'frogbot:question:custom:call-form:1', card, thread }),
    );

    const open = slackCalls.filter(({ method }) => method === 'views.open').at(-1)!.body as {
      view: { private_metadata: string };
    };

    await host.webhook(
      'slack',
      submitView({
        blockId: 'frogbot:question:custom:call-form:1',
        metadata: open.view.private_metadata,
        value: 'Extra large',
      }),
    );

    expect(await settlements(thread)).toEqual([]);

    model.respond({ text: 'Noted.' });

    await host.webhook(
      'slack',
      click({
        actionId: 'frogbot:question:submit:call-form',
        card,
        thread,
        state: {
          values: {
            'frogbot:question:call-form:0': {
              'frogbot:question:choose:call-form:0': {
                type: 'checkboxes',
                selected_options: [{ value: '0' }, { value: '2' }],
              },
            },
            'frogbot:question:call-form:1': {
              'frogbot:question:choose:call-form:1': {
                type: 'radio_buttons',
                selected_option: null,
              },
            },
          },
        },
      }),
    );

    await runContinuation(thread);

    expect(lastToolResult()).toEqual({
      answers: [
        { header: 'Colors', selected: ['Red', 'Green'] },
        { header: 'Size', selected: [], custom: 'Extra large' },
      ],
    });
  });

  it('holds a thread message sent while a question is open without answering it', async () => {
    const thread = '1.000009';
    const card = await ask({ thread, toolCallId: 'call-queued' });
    const host = getChannelHost(frogbot)!;

    await host.webhook('slack', mention({ message: 'Make it matte', thread, ts: '1.100009' }));
    await host.run(JSON.parse(JSON.stringify((await jobs(thread)).at(-1))));

    expect(model.requests).toHaveLength(1);
    expect(await settlements(thread)).toEqual([]);

    model.respond({ text: 'Red, and I read your note.' }, { text: 'Replying to your note.' });

    await host.webhook(
      'slack',
      click({ actionId: 'frogbot:question:choose:call-queued:0:0', card, thread, value: '0' }),
    );
    await runContinuation(thread);

    const promotion = (await jobs(thread)).find((input) => input.kind === 'promote');

    expect(model.requests).toHaveLength(2);

    await host.run(JSON.parse(JSON.stringify(promotion)));

    expect(JSON.stringify(slackCalls.map(({ body }) => body))).toContain('Replying to your note.');
    expect(JSON.stringify(model.requests[1]!.messages)).not.toContain('Make it matte');
    expect(JSON.stringify(model.requests[2]!.messages)).toContain('Make it matte');
  });

  it('runs a message queued behind a dismissed question as a channel job', async () => {
    const thread = '1.000010';
    const card = await ask({ thread, toolCallId: 'call-queued-dismiss' });
    const host = getChannelHost(frogbot)!;

    await host.webhook('slack', mention({ thread, ts: '1.100010' }));
    await host.run(JSON.parse(JSON.stringify((await jobs(thread)).at(-1))));

    const before = (await jobs(thread)).length;

    model.respond({ text: 'Replying to your note.' });

    await host.webhook(
      'slack',
      click({ actionId: 'frogbot:question:dismiss:call-queued-dismiss', card, thread }),
    );

    expect(model.requests).toHaveLength(1);
    expect((await jobs(thread)).length).toBe(before + 1);
  });

  it('keeps a pending card answerable after the server restarts', async () => {
    const thread = '1.000008';
    const card = await ask({ thread, toolCallId: 'call-restart' });

    await frogbot.destroy();

    frogbot = await boot(directory);

    model.respond({ text: 'Red after restart.' });

    await getChannelHost(frogbot)!.webhook(
      'slack',
      click({ actionId: 'frogbot:question:choose:call-restart:0:0', card, thread, value: '0' }),
    );

    expect(await continuations(thread)).toHaveLength(1);

    await runContinuation(thread);

    expect(lastToolResult()).toEqual({ answers: [{ header: 'Color', selected: ['Red'] }] });
  });
});
