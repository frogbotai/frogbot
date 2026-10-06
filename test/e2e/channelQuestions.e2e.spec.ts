import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AgentModelId, FrogBotInstance, FrogBotSanitizedConfig, Where } from 'frogbot';
import { buildConfig } from 'frogbot';
import {
  type ChannelQuestionCall,
  definePiece,
  type PieceChannelQuestions,
  type QuestionInteraction,
  type QuestionRecord,
} from 'frogbot/pieces';
import { FrogBot } from 'frogbot/test';
import { question, type QuestionInput } from 'frogbot/tools';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createSlackAdapter } from '../../packages/pieces/piece-slack/node_modules/@chat-adapter/slack/dist/index.js';
import { createSlack } from '../../packages/pieces/piece-slack/src/index.js';
import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel.js';
import { testPort } from '../__helpers/shared/testPorts.js';
import { startPieceServer } from './nativePieceServers.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const MODEL_PORT = testPort(4093);
const SIGNING_SECRET = 'channel-questions-e2e-signing-secret';
const BOT_TOKEN = 'xoxb-channel-questions-e2e';
const CHANNEL_TASK = 'frogbot-run-channel-message';
const UPDATE_TASK = 'frogbot-update-channel-question';
const STILL_POSTING = 'The next question is still posting — try again in a moment.';
const STALE_NOTICE = 'That question was already answered or is out of date.';
const CLOCK = 1_800_000_000;
const PASSWORD = 'channel-questions-e2e-password';

type SlackCall = { method: string; body: Record<string, unknown>; ts?: string };

type SlackFault = { method: string; match?: (body: Record<string, unknown>) => boolean };

type StoredQuestion = QuestionRecord & {
  call: { toolCallId: string };
  pending?: 'update';
  settled?: { at: string };
};

type PagesState = { q: number; answers: Array<{ header: string; selected: string[] }> };

type Job = {
  id: number | string;
  taskSlug: string;
  completedAt?: string | null;
  hasError?: boolean;
  input: { kind?: string; revision?: number; thread: { id: string } };
};

type QuestionToolInput = z.input<typeof QuestionInput>;

type User = { id: number | string; email: string; headers: Record<string, string> };

type StoredMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string; state?: string; text?: string; errorText?: string }>;
};

const people: Record<string, string> = {
  U1: 'alice@channel-questions.test',
  U2: 'bob@channel-questions.test',
  U3: 'carol@channel-questions.test',
};

const twoQuestions: QuestionToolInput = {
  questions: [
    { header: 'Color', question: 'Which color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
    { header: 'Size', question: 'Which size?', options: [{ label: 'Small' }, { label: 'Large' }] },
  ],
};

const threeQuestions: QuestionToolInput = {
  questions: [
    ...twoQuestions.questions,
    { header: 'Finish', question: 'Which finish?', options: [{ label: 'Matte' }] },
  ],
};

const longQuestion: QuestionToolInput = {
  questions: [
    {
      header: 'Terms',
      question: `Do you accept these terms? ${'Every clause matters. '.repeat(20)}`,
      options: [{ label: 'Accept' }, { label: 'Decline' }],
    },
  ],
};

const colorQuestion: QuestionToolInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should the fence be?',
      options: [{ label: 'Red' }, { label: 'Blue' }],
    },
  ],
};

function slackTime(ts: string): string {
  return new Date(Number(ts) * 1000).toISOString();
}

function threadParts(threadId: string) {
  const [, channel = '', threadTs] = threadId.split(':');

  return { channel, thread_ts: threadTs };
}

function startSlackApi() {
  const calls: SlackCall[] = [];
  const faults: SlackFault[] = [];
  let clock = 0;

  const nextTs = () => `${CLOCK + ++clock}.000000`;

  const reply = (method: string, body: Record<string, unknown>) => {
    if (method === 'auth.test') {
      return { ok: true, user_id: 'UBOT', bot_id: 'BBOT', team_id: 'T1', team: 'E2E' };
    }

    if (method === 'users.info') {
      const id = String(body.user);

      return {
        ok: true,
        user: {
          id,
          name: id.toLowerCase(),
          real_name: `User ${id}`,
          profile: { email: people[id], real_name: `User ${id}`, display_name: id },
        },
      };
    }

    if (method === 'conversations.info') {
      return { ok: true, channel: { id: body.channel, name: 'general', is_im: false } };
    }

    if (method === 'chat.postMessage') {
      const ts = nextTs();

      return { ok: true, ts, channel: body.channel, message: { ts, text: body.text } };
    }

    if (method === 'chat.update') return { ok: true, ts: body.ts, channel: body.channel };

    if (method === 'chat.postEphemeral') return { ok: true, message_ts: nextTs() };

    return { ok: true };
  };

  const server: Server = createServer(async (req, res) => {
    const method = new URL(req.url!, 'http://127.0.0.1').pathname
      .split('/')
      .filter(Boolean)
      .at(-1)!;
    const raw = await text(req);
    const body = (
      raw.startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw))
    ) as Record<string, unknown>;

    const fault = faults.findIndex(
      (candidate) => candidate.method === method && (candidate.match?.(body) ?? true),
    );

    res.writeHead(200, { 'content-type': 'application/json' });

    if (fault !== -1) {
      faults.splice(fault, 1);
      calls.push({ method: `${method}!failed`, body });
      res.end(JSON.stringify({ ok: false, error: 'internal_error' }));

      return;
    }

    const result = reply(method, body);

    calls.push({ method, body, ...(typeof result.ts === 'string' ? { ts: result.ts } : {}) });
    res.end(JSON.stringify(result));
  });

  return new Promise<{
    calls: SlackCall[];
    faults: SlackFault[];
    now: () => number;
    url: string;
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        calls,
        faults,
        now: () => CLOCK + clock,
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

type SlackApi = Awaited<ReturnType<typeof startSlackApi>>;

let slackApi: SlackApi;

type PagesClient = {
  request(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
};

function pagesClient(): PagesClient {
  return {
    async request(method, body) {
      const response = await fetch(`${slackApi.url}${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Record<string, unknown>;

      if (result.ok !== true) throw new Error(`Slack API request failed: ${String(result.error)}`);

      return result;
    },
  };
}

function actionId(call: ChannelQuestionCall, q: number, n: number) {
  return `pages:${call.toolCallId}:${q}:${n}`;
}

async function postPage({
  client,
  text: body,
  threadId,
  blocks,
}: {
  client: PagesClient;
  text: string;
  threadId: string;
  blocks?: unknown[];
}) {
  const response = await client.request('chat.postMessage', {
    ...threadParts(threadId),
    text: body,
    ...(blocks ? { blocks } : {}),
  });
  const ts = String(response.ts);

  return { id: ts, postedAt: slackTime(ts) };
}

function postCard({
  call,
  client,
  q,
  threadId,
}: {
  call: ChannelQuestionCall;
  client: PagesClient;
  q: number;
  threadId: string;
}) {
  const item = call.input.questions[q];

  return postPage({
    client,
    threadId,
    text: `Q${q + 1}: ${item.question.slice(0, 40)}`,
    blocks: [
      {
        type: 'actions',
        elements: item.options.map((option, n) => ({
          type: 'button',
          action_id: actionId(call, q, n),
          text: { type: 'plain_text', text: option.label },
          value: String(n),
        })),
      },
    ],
  });
}

function interactionUser(interaction: QuestionInteraction) {
  return interaction.type === 'message'
    ? interaction.message.author.userId
    : interaction.event.user.userId;
}

async function notice({
  client,
  interaction,
  message,
  threadId,
}: {
  client: PagesClient;
  interaction: QuestionInteraction;
  message: string;
  threadId: string;
}) {
  await client.request('chat.postEphemeral', {
    ...threadParts(threadId),
    user: interactionUser(interaction),
    text: message,
  });
}

function answerFor({
  call,
  q,
  selected,
  state,
}: {
  call: ChannelQuestionCall;
  q: number;
  selected: string[];
  state: PagesState;
}) {
  const answers = [...state.answers, { header: call.input.questions[q].header, selected }];

  return q + 1 < call.input.questions.length
    ? { kind: 'partial' as const, state: { q: q + 1, answers } satisfies PagesState }
    : { kind: 'answer' as const, output: { answers } };
}

const pagesQuestions: PieceChannelQuestions<PagesClient> = {
  async render({ calls, client, thread }) {
    const [call] = calls;

    if (!call) return [];

    const overflow =
      call.input.questions[0].question.length > 200
        ? [
            {
              ...(await postPage({
                client,
                threadId: thread.id,
                text: `(continued) ${call.input.questions[0].question}`,
              })),
              question: 0,
            },
          ]
        : [];
    const card = await postCard({ call, client, q: 0, threadId: thread.id });

    return [
      {
        calls: [call.toolCallId],
        messages: [...overflow, { ...card, question: 0 }],
        state: { q: 0, answers: [] } satisfies PagesState,
      },
    ];
  },

  parse({ call, interaction, question: record, settled }) {
    const state = record.state as PagesState;

    if (interaction.type === 'modalSubmit') return { kind: 'ignore' };

    if (interaction.type === 'message') {
      if (settled) return { kind: 'ignore' };

      const sent = new Date(interaction.message.metadata.dateSent).getTime();

      if (sent < new Date(record.messages.at(-1)!.postedAt).getTime()) return { kind: 'stale' };

      return answerFor({ call, q: state.q, selected: [interaction.message.text.trim()], state });
    }

    const [prefix, toolCallId, q, n] = interaction.event.actionId.split(':');

    if (prefix !== 'pages' || toolCallId !== call.toolCallId) return { kind: 'ignore' };

    if (Number(q) !== state.q) return { kind: 'stale' };

    const option = call.input.questions[state.q].options[Number(n)];

    return option
      ? answerFor({ call, q: state.q, selected: [option.label], state })
      : { kind: 'ignore' };
  },

  async updated({ call, client, question: record, thread }) {
    const state = record.state as PagesState;
    const card = await postCard({ call, client, q: state.q, threadId: thread.id });

    return { messages: [...record.messages, { ...card, question: state.q }] };
  },

  async settled({ actor, client, outcome, question: record, thread }) {
    const who = actor?.channel?.id ?? 'someone';
    const closed = 'output' in outcome ? `Answered by ${who}` : `Dismissed by ${who}`;

    await Promise.all(
      record.messages.map(({ id }) =>
        client.request('chat.update', {
          channel: threadParts(thread.id).channel,
          ts: id,
          text: closed,
          blocks: [],
        }),
      ),
    );
  },

  async rejected({ client, interaction, reason, thread }) {
    await notice({ client, interaction, message: reason, threadId: thread.id });
  },

  async denied({ client, interaction, thread }) {
    await notice({ client, interaction, message: 'No access.', threadId: thread.id });
  },

  async stale({ client, interaction, thread }) {
    await notice({ client, interaction, message: STALE_NOTICE, threadId: thread.id });
  },
};

async function identity({
  author,
  req,
}: {
  author: { userId: string };
  req: { frogbot: FrogBotInstance };
}) {
  const email = people[author.userId];

  if (!email) return null;

  const result = await req.frogbot.find({
    collection: 'users' as never,
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  });

  return result.docs[0] ? { ...(result.docs[0] as object), collection: 'users' } : null;
}

const pagesAuth = z.object({ botToken: z.string() });

const createPages = definePiece({
  slug: 'pages',
  label: 'Pages',
  auth: pagesAuth,
  client: () => pagesClient(),
  actions: [],
  channel: {
    adapter: ({ auth }) =>
      createSlackAdapter({
        botToken: pagesAuth.parse(auth).botToken,
        botUserId: 'UBOT',
        signingSecret: SIGNING_SECRET,
        apiUrl: slackApi.url,
        nativeStreaming: false,
        webClientOptions: { retryConfig: { retries: 0 } },
      }),
    identity: identity as never,
    questions: pagesQuestions as never,
  },
});

describe.skipIf(!RUN_E2E)('Channel questions e2e — Slack threads over real HTTP', () => {
  let config: FrogBotSanitizedConfig;
  let dataDir: string;
  let frogbot: FrogBotInstance;
  let model: StubChatModel;
  let server: Awaited<ReturnType<typeof startPieceServer>>;
  let alice: User;
  let bob: User;
  let eventId = 0;
  const blocked: string[] = [];
  const previousSlackApiUrl = process.env.SLACK_API_URL;

  function sign(body: string, contentType: string) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', SIGNING_SECRET)
      .update(`v0:${timestamp}:${body}`)
      .digest('hex');

    return {
      body,
      headers: {
        'content-type': contentType,
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': `v0=${signature}`,
      },
    };
  }

  async function webhook(instance: string, signed: ReturnType<typeof sign>) {
    const response = await fetch(`${server.url}/api/webhooks/${instance}`, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(30_000),
    });

    expect(response.status).toBe(200);
  }

  function event(event: Record<string, unknown>) {
    return sign(
      JSON.stringify({
        type: 'event_callback',
        event_id: `Ev${++eventId}`,
        team_id: 'T1',
        event: { channel: 'C1', ...event },
      }),
      'application/json',
    );
  }

  async function mention({
    instance,
    thread,
    user = 'U1',
    message = '<@UBOT> help me choose',
  }: {
    instance: string;
    thread: string;
    user?: string;
    message?: string;
  }) {
    await webhook(instance, event({ type: 'app_mention', ts: thread, text: message, user }));
    await work();
  }

  async function reply({
    instance,
    thread,
    ts,
    user,
    message,
  }: {
    instance: string;
    thread: string;
    ts: string;
    user: string;
    message: string;
  }) {
    await webhook(
      instance,
      event({
        type: 'message',
        ts,
        thread_ts: thread,
        text: message,
        user,
        channel_type: 'channel',
      }),
    );
    await work();
  }

  function clickRequest({
    action,
    card,
    thread,
    user,
    value,
  }: {
    action: string;
    card: string;
    thread: string;
    user: string;
    value: string;
  }) {
    return sign(
      `payload=${encodeURIComponent(
        JSON.stringify({
          type: 'block_actions',
          trigger_id: `trigger-${card}-${user}`,
          user: { id: user, username: user.toLowerCase(), name: user },
          team: { id: 'T1' },
          channel: { id: 'C1' },
          container: { type: 'message', channel_id: 'C1', message_ts: card },
          message: { ts: card, thread_ts: thread },
          actions: [{ action_id: action, value }],
        }),
      )}`,
      'application/x-www-form-urlencoded',
    );
  }

  async function click(instance: string, args: Parameters<typeof clickRequest>[0]) {
    await webhook(instance, clickRequest(args));
    await work();
  }

  async function jobs(where: Where = {}): Promise<Job[]> {
    const result = await frogbot.find({
      collection: 'payload-jobs' as never,
      where: { and: [{ taskSlug: { in: [CHANNEL_TASK, UPDATE_TASK] } }, where] },
      sort: 'createdAt',
      limit: 0,
      overrideAccess: true,
    });

    return result.docs;
  }

  async function work({ timeout = 20_000 }: { timeout?: number } = {}) {
    await expect
      .poll(
        async () => {
          await frogbot.jobs.run({ allQueues: true, req: await frogbot.createRequest() });

          return (await jobs({ completedAt: { exists: false }, hasError: { not_equals: true } }))
            .length;
        },
        { timeout, interval: 100 },
      )
      .toBe(0);

    expect(await jobs({ hasError: { equals: true } })).toEqual([]);
  }

  async function threadJobs(thread: string) {
    return (await jobs()).filter(({ input }) => input.thread.id === `slack:C1:${thread}`);
  }

  async function request(
    method: string,
    route: string,
    { body, user }: { body?: unknown; user?: User } = {},
  ) {
    const response = await fetch(`${server.url}/api${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...user?.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();

    return {
      status: response.status,
      body: (raw ? JSON.parse(raw) : null) as Record<string, unknown>,
    };
  }

  async function signIn(email: string): Promise<User> {
    const doc = await frogbot.create({
      collection: 'users' as never,
      data: { email, password: PASSWORD } as never,
      overrideAccess: true,
    });
    const login = await request('POST', '/users/login', { body: { email, password: PASSWORD } });

    expect(login.status).toBe(200);

    return { id: doc.id, email, headers: { Authorization: `JWT ${String(login.body.token)}` } };
  }

  async function chatOf(thread: string) {
    const result = await frogbot.find({
      collection: 'chats' as never,
      where: { externalId: { contains: thread } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    expect(result.docs).toHaveLength(1);

    return result.docs[0] as unknown as {
      id: number | string;
      user: number | string;
      channel: string;
      channelKey: string;
      channelThread: { account: string; thread: { id: string } };
    };
  }

  async function messagesOf(chatId: number | string): Promise<StoredMessage[]> {
    const result = await frogbot.find({
      collection: 'messages' as never,
      where: { chat: { equals: chatId } },
      sort: 'createdAt',
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    return result.docs;
  }

  async function record({
    instance,
    thread,
    toolCallId,
  }: {
    instance: string;
    thread: string;
    toolCallId: string;
  }) {
    const chat = await chatOf(thread);

    return frogbot.kv.get<StoredQuestion>(
      `channels:support:${instance}:questions:call:${chat.id}:${toolCallId}`,
    );
  }

  function since(mark: number) {
    return slackApi.calls.slice(mark);
  }

  function posts(mark: number, thread: string) {
    return since(mark).filter(
      ({ method, body }) => method === 'chat.postMessage' && body.thread_ts === thread,
    );
  }

  function ephemerals(mark: number) {
    return since(mark)
      .filter(({ method }) => method === 'chat.postEphemeral')
      .map(({ body }) => ({ user: body.user, text: body.text }));
  }

  function updates(mark: number, ids?: string[]) {
    return since(mark)
      .filter(
        ({ method, body }) => method === 'chat.update' && (!ids || ids.includes(String(body.ts))),
      )
      .map(({ body }) => ({ ts: body.ts, text: body.text }));
  }

  function lastToolResult() {
    const result = model.requests
      .at(-1)!
      .messages.filter(({ role }) => role === 'tool')
      .at(-1);

    return JSON.parse(String(result?.content));
  }

  function slackText(mark = 0) {
    return JSON.stringify(since(mark).map(({ body }) => body));
  }

  async function ask({
    input,
    instance,
    thread,
    toolCallId,
  }: {
    input: QuestionToolInput;
    instance: string;
    thread: string;
    toolCallId: string;
  }) {
    const mark = slackApi.calls.length;

    model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input }] });

    await mention({ instance, thread });

    return posts(mark, thread).map(({ ts }) => ts!);
  }

  async function start() {
    frogbot = await new FrogBot().init({ config, startChannelGateway: false });
  }

  async function restart() {
    await frogbot.destroy();
    (globalThis as { _payload?: Map<string, unknown> })._payload?.delete('default');
    await start();
  }

  beforeAll(async () => {
    slackApi = await startSlackApi();
    model = await startStubChatModel(MODEL_PORT);
    process.env.SLACK_API_URL = slackApi.url;

    const nativeFetch = globalThis.fetch;

    vi.stubGlobal('fetch', ((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.origin === 'https://slack.com') {
        const redirected = new URL(url.pathname.replace(/^\/api\//, ''), slackApi.url);

        return nativeFetch(
          input instanceof Request ? new Request(redirected, input) : redirected,
          init,
        );
      }

      if (url.hostname !== '127.0.0.1') {
        blocked.push(url.origin);

        throw new Error(`External network is disabled in the channel questions E2E: ${url.origin}`);
      }

      return nativeFetch(input, init);
    }) satisfies typeof fetch);

    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-channel-questions-e2e-'));

    config = await buildConfig({
      secret: 'channel-questions-e2e-secret',
      telemetry: false,
      db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'channel.db')}` } }),
      typescript: { autoGenerate: false },
      jobs: { deleteJobOnComplete: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'chats', chat: true, fields: [] },
      ],
      ai: {
        providers: {
          local: {
            type: 'openai-compatible',
            baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`,
            apiKey: 'e2e-key',
            models: [{ id: 'channel-e2e', mode: 'chat' }],
          },
        },
      },
      agents: [
        {
          slug: 'support',
          model: 'local/channel-e2e' as AgentModelId,
          instructions: 'Ask before acting.',
          tools: [question],
          channels: [
            createSlack({ auth: { botToken: BOT_TOKEN }, signingSecret: SIGNING_SECRET }),
            createPages({ auth: { botToken: BOT_TOKEN } }),
          ],
        },
      ],
    });

    await start();

    const app = new Hono();

    app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));

    server = await startPieceServer(app);

    alice = await signIn(people.U1);
    bob = await signIn(people.U2);
    await signIn(people.U3);
  });

  beforeEach(() => {
    model.reset();
    slackApi.faults.splice(0);
  });

  afterEach(() => {
    if (blocked.length) throw new Error(`Unexpected outbound requests: ${JSON.stringify(blocked)}`);
  });

  afterAll(async () => {
    try {
      const results = await Promise.allSettled([server?.close(), frogbot?.destroy()]);

      await Promise.allSettled([model?.close(), slackApi?.close()]);

      results.forEach((result) => {
        if (result.status === 'rejected') throw result.reason;
      });
    } finally {
      vi.unstubAllGlobals();

      if (previousSlackApiUrl === undefined) delete process.env.SLACK_API_URL;
      else process.env.SLACK_API_URL = previousSlackApiUrl;

      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    }
  });

  describe('bug 1 — answers bind to the question people saw', () => {
    it('sends a second click and an earlier reply on question 1 to stale, and settles with the real answers', async () => {
      const thread = `${CLOCK}.000101`;
      const toolCallId = 'bug1-call';
      const [q1] = await ask({ input: twoQuestions, instance: 'pages', thread, toolCallId });
      const q1PostedAt = Number(q1);

      let mark = slackApi.calls.length;

      await click('pages', {
        action: `pages:${toolCallId}:0:0`,
        card: q1,
        thread,
        user: 'U1',
        value: '0',
      });

      const [q2] = posts(mark, thread).map(({ ts }) => ts!);

      expect(q2).toBeDefined();
      expect((await record({ instance: 'pages', thread, toolCallId }))!).toMatchObject({
        revision: 1,
        messages: [{ id: q1 }, { id: q2 }],
        state: { q: 1, answers: [{ header: 'Color', selected: ['Red'] }] },
      });
      expect((await record({ instance: 'pages', thread, toolCallId }))!.pending).toBeUndefined();

      mark = slackApi.calls.length;

      await click('pages', {
        action: `pages:${toolCallId}:0:1`,
        card: q1,
        thread,
        user: 'U2',
        value: '1',
      });

      await reply({
        instance: 'pages',
        thread,
        ts: `${q1PostedAt}.500000`,
        user: 'U2',
        message: 'Blue',
      });

      expect(ephemerals(mark)).toEqual([
        { user: 'U2', text: STALE_NOTICE },
        { user: 'U2', text: STALE_NOTICE },
      ]);
      expect(updates(mark)).toEqual([]);
      expect(posts(mark, thread)).toEqual([]);
      expect(await record({ instance: 'pages', thread, toolCallId })).toMatchObject({
        revision: 1,
        state: { q: 1, answers: [{ header: 'Color', selected: ['Red'] }] },
      });
      expect(model.requests).toHaveLength(1);

      model.respond({ text: 'Red and large it is.' });
      mark = slackApi.calls.length;

      await click('pages', {
        action: `pages:${toolCallId}:1:1`,
        card: q2,
        thread,
        user: 'U3',
        value: '1',
      });

      expect(lastToolResult()).toEqual({
        answers: [
          { header: 'Color', selected: ['Red'] },
          { header: 'Size', selected: ['Large'] },
        ],
      });
      expect(updates(mark, [q1, q2])).toEqual([
        { ts: q1, text: 'Answered by U3' },
        { ts: q2, text: 'Answered by U3' },
      ]);
      expect(slackText(mark)).toContain('Red and large it is.');
      expect(
        (await threadJobs(thread))
          .map(({ input }) => input.kind ?? 'message')
          .filter((kind) => kind !== 'promote'),
      ).toEqual(['message', 'message', 'continue']);
    });

    it('settles once and advances once when two people click question 1 at the same moment', async () => {
      const thread = `${CLOCK}.000102`;
      const toolCallId = 'race-call';
      const [q1] = await ask({ input: twoQuestions, instance: 'pages', thread, toolCallId });
      const mark = slackApi.calls.length;

      await Promise.all(
        ['U1', 'U2', 'U2'].map((user, index) =>
          webhook(
            'pages',
            clickRequest({
              action: `pages:${toolCallId}:0:${index === 0 ? 0 : 1}`,
              card: q1,
              thread,
              user,
              value: String(index === 0 ? 0 : 1),
            }),
          ),
        ),
      );
      await work();

      const stored = (await record({ instance: 'pages', thread, toolCallId }))!;

      expect(posts(mark, thread)).toHaveLength(1);
      expect(stored.revision).toBe(1);
      expect(stored.messages).toHaveLength(2);
      expect(stored.pending).toBeUndefined();
      expect(ephemerals(mark)).toHaveLength(2);
      expect(ephemerals(mark).map(({ text: notice }) => notice)).toEqual([
        STALE_NOTICE,
        STALE_NOTICE,
      ]);
      expect(model.requests).toHaveLength(1);
    });
  });

  describe('bug 2 — advancing never strands people', () => {
    it('retries a failed question 2 post until it is visible and records no reply in between', async () => {
      const thread = `${CLOCK}.000201`;
      const toolCallId = 'bug2-call';
      const [q1] = await ask({ input: twoQuestions, instance: 'pages', thread, toolCallId });
      const isQ2 = (body: Record<string, unknown>) => String(body.text).startsWith('Q2:');

      slackApi.faults.push({ method: 'chat.postMessage', match: isQ2 });
      slackApi.faults.push({ method: 'chat.postMessage', match: isQ2 });

      let mark = slackApi.calls.length;

      await webhook(
        'pages',
        clickRequest({
          action: `pages:${toolCallId}:0:1`,
          card: q1,
          thread,
          user: 'U1',
          value: '1',
        }),
      );

      expect(since(mark).map(({ method }) => method)).toEqual(['chat.postMessage!failed']);
      expect(await record({ instance: 'pages', thread, toolCallId })).toMatchObject({
        revision: 1,
        pending: 'update',
        messages: [{ id: q1 }],
        state: { q: 1, answers: [{ header: 'Color', selected: ['Blue'] }] },
      });

      const [queued] = (await threadJobs(thread)).filter(
        ({ taskSlug }) => taskSlug === UPDATE_TASK,
      );

      expect(queued).toMatchObject({ input: { kind: 'update', revision: 1 } });

      mark = slackApi.calls.length;

      await webhook(
        'pages',
        event({
          type: 'message',
          ts: `${slackApi.now() + 50}.000000`,
          thread_ts: thread,
          text: 'Small',
          user: 'U2',
          channel_type: 'channel',
        }),
      );

      await work({ timeout: 30_000 });

      const stored = (await record({ instance: 'pages', thread, toolCallId }))!;
      const q2 = stored.messages.at(-1)!.id;

      expect(ephemerals(mark)).toEqual([{ user: 'U2', text: STILL_POSTING }]);
      expect(
        since(mark)
          .filter(({ method }) => method.startsWith('chat.postMessage'))
          .map(({ method }) => method),
      ).toEqual(['chat.postMessage!failed', 'chat.postMessage']);
      expect(stored).toMatchObject({
        revision: 1,
        messages: [{ id: q1 }, { id: q2 }],
        state: { q: 1, answers: [{ header: 'Color', selected: ['Blue'] }] },
      });
      expect(stored.pending).toBeUndefined();
      expect(q2).not.toBe(q1);
      expect(model.requests).toHaveLength(1);

      mark = slackApi.calls.length;
      model.respond({ text: 'Blue and large.' });

      await click('pages', {
        action: `pages:${toolCallId}:1:1`,
        card: q2,
        thread,
        user: 'U3',
        value: '1',
      });

      expect(lastToolResult()).toEqual({
        answers: [
          { header: 'Color', selected: ['Blue'] },
          { header: 'Size', selected: ['Large'] },
        ],
      });
      expect(slackText(mark)).toContain('Blue and large.');

      mark = slackApi.calls.length;

      await frogbot.jobs.queue({
        task: UPDATE_TASK,
        queue: 'frogbot-channel:support:pages',
        input: queued.input,
      } as never);
      await work();

      expect(since(mark)).toEqual([]);
    });

    it('does nothing when an update job runs after the revision has moved on', async () => {
      const thread = `${CLOCK}.000202`;
      const toolCallId = 'moved-call';
      const [q1] = await ask({ input: threeQuestions, instance: 'pages', thread, toolCallId });

      slackApi.faults.push({
        method: 'chat.postMessage',
        match: (body) => String(body.text).startsWith('Q2:'),
      });

      await webhook(
        'pages',
        clickRequest({
          action: `pages:${toolCallId}:0:0`,
          card: q1,
          thread,
          user: 'U1',
          value: '0',
        }),
      );

      const [stale] = (await threadJobs(thread)).filter(({ taskSlug }) => taskSlug === UPDATE_TASK);

      await work();

      const healed = (await record({ instance: 'pages', thread, toolCallId }))!;

      await click('pages', {
        action: `pages:${toolCallId}:1:0`,
        card: healed.messages.at(-1)!.id,
        thread,
        user: 'U2',
        value: '0',
      });

      const moved = (await record({ instance: 'pages', thread, toolCallId }))!;

      expect(moved.revision).toBe(2);
      expect(moved.messages).toHaveLength(3);

      await frogbot.kv.set(
        `channels:support:pages:questions:call:${(await chatOf(thread)).id}:${toolCallId}`,
        { ...moved, pending: 'update' },
      );

      const mark = slackApi.calls.length;

      await frogbot.jobs.queue({
        task: UPDATE_TASK,
        queue: 'frogbot-channel:support:pages',
        input: stale.input,
      } as never);
      await work();

      expect(stale.input.revision).toBe(1);
      expect(since(mark)).toEqual([]);
      expect(await record({ instance: 'pages', thread, toolCallId })).toMatchObject({
        revision: 2,
        pending: 'update',
      });
    });

    it('heals a question left pending by a restart between the save and the post', async () => {
      const thread = `${CLOCK}.000203`;
      const toolCallId = 'restart-call';
      const [q1] = await ask({ input: twoQuestions, instance: 'pages', thread, toolCallId });
      const chat = await chatOf(thread);
      const key = `channels:support:pages:questions:call:${chat.id}:${toolCallId}`;
      const current = (await frogbot.kv.get<StoredQuestion>(key))!;

      await frogbot.kv.set(key, {
        ...current,
        revision: 1,
        pending: 'update',
        state: { q: 1, answers: [{ header: 'Color', selected: ['Red'] }] },
      });

      await restart();

      expect(await threadJobs(thread)).toHaveLength(1);

      let mark = slackApi.calls.length;

      await click('pages', {
        action: `pages:${toolCallId}:0:1`,
        card: q1,
        thread,
        user: 'U2',
        value: '1',
      });

      const healed = (await frogbot.kv.get<StoredQuestion>(key))!;

      expect(ephemerals(mark)).toEqual([{ user: 'U2', text: STILL_POSTING }]);
      expect(posts(mark, thread)).toHaveLength(1);
      expect(healed.pending).toBeUndefined();
      expect(healed.messages.map(({ id }) => id)).toEqual([q1, posts(mark, thread)[0].ts]);

      mark = slackApi.calls.length;
      model.respond({ text: 'Healed.' });

      await click('pages', {
        action: `pages:${toolCallId}:1:0`,
        card: healed.messages.at(-1)!.id,
        thread,
        user: 'U3',
        value: '0',
      });

      expect(lastToolResult()).toEqual({
        answers: [
          { header: 'Color', selected: ['Red'] },
          { header: 'Size', selected: ['Small'] },
        ],
      });
    });
  });

  describe('bug 3 — every message of a question is tracked', () => {
    it('closes the overflow message and the card on settle, and sends clicks on the overflow message to stale', async () => {
      const thread = `${CLOCK}.000301`;
      const toolCallId = 'bug3-call';
      const [overflow, card] = await ask({
        input: longQuestion,
        instance: 'pages',
        thread,
        toolCallId,
      });

      expect(overflow).toBeDefined();
      expect(card).toBeDefined();
      expect((await record({ instance: 'pages', thread, toolCallId }))!.messages).toEqual([
        { id: overflow, postedAt: slackTime(overflow), question: 0 },
        { id: card, postedAt: slackTime(card), question: 0 },
      ]);

      let mark = slackApi.calls.length;

      await click('pages', {
        action: `pages:${toolCallId}:0:0`,
        card: overflow,
        thread,
        user: 'U2',
        value: '0',
      });

      expect(ephemerals(mark)).toEqual([{ user: 'U2', text: STALE_NOTICE }]);
      expect(model.requests).toHaveLength(1);

      mark = slackApi.calls.length;
      model.respond({ text: 'Accepted.' });

      await click('pages', {
        action: `pages:${toolCallId}:0:0`,
        card,
        thread,
        user: 'U2',
        value: '0',
      });

      expect(updates(mark, [overflow, card])).toEqual([
        { ts: overflow, text: 'Answered by U2' },
        { ts: card, text: 'Answered by U2' },
      ]);
      expect(lastToolResult()).toEqual({ answers: [{ header: 'Terms', selected: ['Accept'] }] });
      expect((await record({ instance: 'pages', thread, toolCallId }))!.settled).toBeDefined();
    });
  });

  describe('bug 4 — a Slack conversation is written only from Slack', () => {
    const thread = `${CLOCK}.000401`;
    const toolCallId = 'bug4-call';
    let card: string;
    let chat: Awaited<ReturnType<typeof chatOf>>;

    it('asks natively in the Slack thread', async () => {
      model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input: colorQuestion }] });

      const mark = slackApi.calls.length;

      await mention({ instance: 'slack', thread });

      card = posts(mark, thread).find(({ body }) => body.blocks)!.ts!;
      chat = await chatOf(thread);

      expect(JSON.stringify(posts(mark, thread)[0].body.blocks)).toContain(
        `frogbot:question:choose:${toolCallId}:0:1`,
      );
    });

    it('refuses a web send, a /settle and a REST message create, and posts nothing to Slack', async () => {
      const mark = slackApi.calls.length;
      const before = await messagesOf(chat.id);
      const requests = model.requests.length;

      expect(chat).toMatchObject({ user: alice.id, channel: 'slack' });

      const send = await request('POST', '/agents/support', {
        body: { chatId: chat.id, prompt: 'Hello from the web.' },
        user: alice,
      });
      const settle = await request('POST', `/agents/support/chats/${chat.id}/settle`, {
        body: { toolCallId, output: { answers: [{ header: 'Color', selected: ['Red'] }] } },
        user: alice,
      });
      const dismiss = await request('POST', `/agents/support/chats/${chat.id}/settle`, {
        body: { toolCallId, dismissed: true },
        user: alice,
      });
      const create = await request('POST', '/messages', {
        body: {
          id: 'web-injected',
          chat: chat.id,
          role: 'user',
          parts: [{ type: 'text', text: 'Injected.' }],
        },
        user: alice,
      });

      for (const refused of [send, settle, dismiss]) {
        expect(refused.status).toBe(409);
        expect(refused.body).toMatchObject({
          code: 'channel-chat',
          error:
            'This conversation happens in Slack. Continue it there, or branch it into a new chat.',
        });
      }

      expect(create.status).toBe(403);
      expect(since(mark)).toEqual([]);
      expect(await messagesOf(chat.id)).toEqual(before);
      expect(model.requests).toHaveLength(requests);
    });

    it('ignores a channel context forged in the query string or the body', async () => {
      const mark = slackApi.calls.length;
      const before = await messagesOf(chat.id);
      const forged = new URLSearchParams({
        'context[channel][piece]': 'slack',
        'context[channel][threadId]': chat.channelThread.thread.id,
        'context[channel][author][id]': 'U1',
      });
      const context = {
        channel: { piece: 'slack', threadId: chat.channelThread.thread.id, author: { id: 'U1' } },
      };

      const send = await request('POST', `/agents/support?${forged}`, {
        body: { chatId: chat.id, prompt: 'Forged.' },
        user: alice,
      });
      const sendWithContext = await request('POST', '/agents/support', {
        body: { chatId: chat.id, prompt: 'Forged.', context },
        user: alice,
      });
      const create = await request('POST', `/messages?${forged}`, {
        body: {
          id: 'web-forged',
          chat: chat.id,
          role: 'user',
          parts: [{ type: 'text', text: 'Forged.' }],
          context,
        },
        user: alice,
      });

      expect(send.status).toBe(409);
      expect(sendWithContext.status).toBe(400);

      for (const shape of [{ relationTo: 'chats', value: chat.id }, [chat.id], String(chat.id)]) {
        const reshaped = await request('POST', '/messages', {
          body: {
            id: `web-reshaped-${JSON.stringify(shape).length}`,
            chat: shape,
            role: 'user',
            parts: [{ type: 'text', text: 'Reshaped.' }],
          },
          user: alice,
        });
        expect(reshaped.status, JSON.stringify(shape)).toBeGreaterThanOrEqual(400);
      }

      expect(create.status).toBe(403);
      expect(since(mark)).toEqual([]);
      expect(await messagesOf(chat.id)).toEqual(before);
    });

    it('does not copy the channel home when the owner duplicates the Slack chat', async () => {
      const duplicate = await request('POST', `/chats/${chat.id}/duplicate`, {
        body: {},
        user: alice,
      });

      const copy = (duplicate.body.doc ?? duplicate.body) as Record<string, unknown>;
      const cleared = { channel: null, channelKey: null, channelThread: null, channelLabel: null };

      // Either the copy drops the channel home or the duplicate is rejected.
      expect([
        { status: 200, ...cleared },
        { status: 201, ...cleared },
        { status: 400 },
      ]).toContainEqual({
        status: duplicate.status,
        channel: copy.channel,
        channelKey: copy.channelKey,
        channelThread: copy.channelThread,
        channelLabel: copy.channelLabel,
      });

      expect((await chatOf(thread)).id).toBe(chat.id);
    });

    it('keeps the channel fields read-only when the owner PATCHes them', async () => {
      const patch = await request('PATCH', `/chats/${chat.id}`, {
        body: {
          channel: null,
          channelKey: null,
          externalId: null,
          channelThread: { account: 'slack', thread: { id: 'slack:C1:elsewhere' } },
        },
        user: alice,
      });
      const stored = await chatOf(thread);

      expect(patch.status).toBe(200);
      expect(stored).toMatchObject({
        channel: chat.channel,
        channelKey: chat.channelKey,
        channelThread: chat.channelThread,
      });
    });

    it('branches into a private web chat where the question arrives closed and nothing reaches Slack', async () => {
      const mark = slackApi.calls.length;
      const source = await messagesOf(chat.id);
      const assistant = [...source].reverse().find(({ role }) => role === 'assistant')!;

      const branch = await request('POST', '/frogbot/chat/branch', {
        body: { chatId: chat.id, messageId: assistant.id },
        user: alice,
      });

      expect(branch.status).toBe(200);

      const branchId = branch.body.chatId as number | string;
      const branched = await messagesOf(branchId);

      expect(branched.at(-1)!.parts.find(({ type }) => type === 'tool-question')).toMatchObject({
        state: 'output-error',
      });

      const read = await request('GET', `/chats/${branchId}?depth=0`, { user: alice });

      expect(read.body).toMatchObject({ channel: null, channelLabel: null });

      model.respond({ text: 'Here is a private summary.' });

      const send = await request('POST', '/agents/support', {
        body: { chatId: branchId, prompt: 'Summarize the thread for me.' },
        user: alice,
      });

      expect(send.status).toBe(200);
      expect((await messagesOf(branchId)).map(({ role }) => role)).toEqual([
        ...branched.map(({ role }) => role),
        'user',
        'assistant',
      ]);

      const stranger = await request('POST', '/messages', {
        body: {
          id: 'bob-into-alice-branch',
          chat: branchId,
          role: 'user',
          parts: [{ type: 'text', text: 'Cross-user.' }],
        },
        user: bob,
      });

      expect(stranger.status).toBe(403);
      await work();
      expect(since(mark)).toEqual([]);
      expect(await messagesOf(chat.id)).toEqual(source);
    });

    it('still takes the answer in Slack afterwards and continues in the thread', async () => {
      const mark = slackApi.calls.length;

      model.respond({ text: 'Painting the fence blue.' });

      await click('slack', {
        action: `frogbot:question:choose:${toolCallId}:0:1`,
        card,
        thread,
        user: 'U2',
        value: '1',
      });

      expect(lastToolResult()).toEqual({ answers: [{ header: 'Color', selected: ['Blue'] }] });
      expect(updates(mark, [card])).toHaveLength(1);
      expect(slackText(mark)).toContain('Painting the fence blue.');
    });
  });

  describe('adversarial — REST duplicate into a Slack conversation', () => {
    it('refuses to copy a message into the Slack chat, and the Slack card keeps working', async () => {
      const thread = `${CLOCK}.000501`;
      const toolCallId = 'duplicate-call';

      model.respond({ toolCalls: [{ id: toolCallId, name: 'question', input: colorQuestion }] });

      let mark = slackApi.calls.length;

      await mention({ instance: 'slack', thread });

      const card = posts(mark, thread).find(({ body }) => body.blocks)!.ts!;
      const chat = await chatOf(thread);
      const before = await messagesOf(chat.id);

      const duplicate = await request('POST', `/messages/${before[0].id}/duplicate`, {
        body: {
          id: 'web-duplicate',
          parts: [{ type: 'text', text: 'Injected through duplicate.' }],
        },
        user: alice,
      });

      expect.soft(duplicate.status).toBeGreaterThanOrEqual(400);
      expect.soft(await messagesOf(chat.id)).toEqual(before);

      mark = slackApi.calls.length;
      model.respond({ text: 'Blue it is.' });

      await click('slack', {
        action: `frogbot:question:choose:${toolCallId}:0:1`,
        card,
        thread,
        user: 'U2',
        value: '1',
      });

      expect.soft(JSON.stringify(model.requests)).not.toContain('Injected through duplicate.');
      expect.soft(ephemerals(mark)).toEqual([]);
      expect(slackText(mark)).toContain('Blue it is.');
    });
  });
});
