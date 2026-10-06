import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AgentModelId, FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { question, type QuestionInput } from 'frogbot/tools';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLinear } from '../../packages/pieces/piece-linear/dist/index.js';
import { startStubChatModel, type StubChatModel } from '../__helpers/shared/StubChatModel.js';
import { testPort } from '../__helpers/shared/testPorts.js';
import {
  type LinearApi,
  type LinearUser,
  redirectLinearFetch,
  sessionCreated,
  sessionPrompted,
  signLinearDelivery,
  startLinearApi,
} from '../unit/frogbot/channels/linearFixtures.js';
import { startPieceServer } from './nativePieceServers.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const MODEL_PORT = testPort(4098);
const webhookSecret = 'linear-questions-e2e-secret';

const frog: LinearUser = { id: 'linear-frog', name: 'Frog', email: 'frog@linear-e2e.test' };
const toad: LinearUser = { id: 'linear-toad', name: 'Toad', email: 'toad@linear-e2e.test' };
const stranger: LinearUser = {
  id: 'linear-stranger',
  name: 'Stranger',
  email: 'stranger@linear-e2e.test',
};

const labels = ['Blue — navy', 'C++', 'snake_case', '2', '*bold*', 'Ünïcode 🐸'];

const paletteQuestion: QuestionInput = {
  questions: [
    {
      header: 'Palette',
      question: 'Which palette should the release page use?',
      options: labels.map((label, index) => ({
        label,
        ...(index === 0 ? { description: 'The brand default' } : {}),
      })),
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
      custom: false,
    },
  ],
};

let promptId = 0;

describe.skipIf(!RUN_E2E)(
  'Linear agent questions e2e — webhooks, native elicitations, continuation',
  () => {
    let api: LinearApi;
    let dataDir: string;
    let frogbot: FrogBotInstance;
    let model: StubChatModel;
    let server: Awaited<ReturnType<typeof startPieceServer>>;
    const blockedRequests: string[] = [];

    async function post(payload: object, headers = signed(payload)) {
      return fetch(`${server.url}/api/webhooks/linear`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
    }

    function signed(payload: object) {
      return signLinearDelivery({ body: JSON.stringify(payload), secret: webhookSecret });
    }

    async function pendingJobs() {
      const result = await frogbot.find({
        collection: 'payload-jobs' as never,
        where: { completedAt: { exists: false } },
        limit: 0,
        overrideAccess: true,
      });

      return result.docs.length;
    }

    async function work() {
      for (let round = 0; round < 10 && (await pendingJobs()) > 0; round++) {
        await frogbot.jobs.run({ allQueues: true, silent: true });
      }

      expect(await pendingJobs()).toBe(0);
    }

    async function start(session: string) {
      const response = await post(sessionCreated({ session, user: frog }));

      expect(response.status).toBe(200);

      await work();
    }

    async function reply({
      body,
      session,
      signal,
      user = toad,
    }: {
      body: string;
      session: string;
      signal?: string;
      user?: LinearUser;
    }) {
      const response = await post(
        sessionPrompted({ body, id: `prompt-${++promptId}`, session, signal, user }),
      );

      expect(response.status).toBe(200);

      await work();
    }

    function activities(session: string) {
      return api.sessionActivities(session).map(({ input }) => input);
    }

    async function chatOf(session: string) {
      const chats = await frogbot.find({
        collection: 'chats' as never,
        limit: 0,
        overrideAccess: true,
      });

      return chats.docs.find(
        (doc) =>
          (doc as { channelThread?: { thread?: { id?: string } } }).channelThread?.thread?.id ===
          `linear:issue-1:s:${session}`,
      )!;
    }

    async function settlements(session: string) {
      const chat = await chatOf(session);
      const messages = await frogbot.find({
        collection: 'messages' as never,
        where: { chat: { equals: chat.id } },
        limit: 0,
        overrideAccess: true,
      });

      return messages.docs.flatMap((doc) =>
        Object.entries((doc as { settlements?: object }).settlements ?? {}),
      );
    }

    function toolResults() {
      return model.requests
        .at(-1)!
        .messages.filter(({ role }) => role === 'tool')
        .map(({ content }) => JSON.parse(String(content)));
    }

    beforeAll(async () => {
      api = await startLinearApi({ users: [frog, toad, stranger] });
      model = await startStubChatModel(MODEL_PORT);

      const nativeFetch = globalThis.fetch;
      const linearFetch = redirectLinearFetch({ apiUrl: api.url, fetch: nativeFetch });

      vi.stubGlobal('fetch', ((input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());

        if (url.hostname !== '127.0.0.1' && url.origin !== 'https://api.linear.app') {
          blockedRequests.push(url.origin);

          throw new Error(
            `External network is disabled in the Linear questions E2E: ${url.origin}`,
          );
        }

        return linearFetch(input, init);
      }) satisfies typeof fetch);

      dataDir = mkdtempSync(join(tmpdir(), 'frogbot-linear-questions-e2e-'));

      const config = await buildConfig({
        secret: 'linear-questions-e2e-secret',
        telemetry: false,
        db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'linear.db')}` } }),
        typescript: { autoGenerate: false },
        collections: [{ slug: 'users', auth: true, fields: [] }],
        jobs: { autoRun: [], shouldAutoRun: () => false },
        ai: {
          providers: {
            local: {
              type: 'openai-compatible',
              baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`,
              apiKey: 'test-key',
              models: [{ id: 'linear-e2e', mode: 'chat' }],
            },
          },
        },
        agents: [
          {
            slug: 'support',
            model: 'local/linear-e2e' as AgentModelId,
            instructions: 'Ask before choosing a palette.',
            tools: [question],
            channels: [createLinear({ auth: { accessToken: 'linear-e2e-token' }, webhookSecret })],
          },
        ],
      });

      frogbot = await new FrogBot().init({ config });

      const app = new Hono();

      app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));
      server = await startPieceServer(app);

      for (const { email } of [frog, toad]) {
        await frogbot.create({
          collection: 'users' as never,
          data: { email, password: 'linear-e2e-password' } as never,
          overrideAccess: true,
        });
      }
    });

    beforeEach(() => {
      model.reset();
      api.reset();
    });

    afterEach(() => {
      expect(blockedRequests).toEqual([]);
      expect(api.unexpected).toEqual([]);
    });

    afterAll(async () => {
      try {
        const results = await Promise.allSettled([
          server?.close(),
          frogbot?.destroy(),
          model?.close(),
          api?.close(),
        ]);

        for (const result of results) {
          if (result.status === 'rejected') throw result.reason;
        }
      } finally {
        vi.unstubAllGlobals();

        if (dataDir) rmSync(dataDir, { recursive: true, force: true });
      }
    });

    it('asks a native Linear question, settles the signed reply, and posts the continuation', async () => {
      const session = 'session-loop';

      model.respond({
        toolCalls: [{ id: 'call-palette', name: 'question', input: paletteQuestion }],
      });

      await start(session);

      expect(model.requests[0].tools?.map(({ function: tool }) => tool.name)).toEqual(['question']);
      expect(activities(session)).toEqual([
        {
          agentSessionId: session,
          content: {
            type: 'elicitation',
            body: [
              '**Palette**\nWhich palette should the release page use?',
              [
                '- **Blue — navy** — The brand default',
                '- **C++**',
                '- **snake\\_case**',
                '- **2**',
                '- **\\*bold\\***',
                '- **Ünïcode 🐸**',
              ].join('\n'),
              'Choose an option, or reply with your own answer.',
            ].join('\n\n'),
          },
          signal: 'select',
          signalMetadata: { options: labels.map((label) => ({ label, value: label })) },
        },
      ]);

      model.respond({ text: 'Using the snake_case palette.' });

      await reply({ body: 'snake_case', session });

      expect(await settlements(session)).toMatchObject([
        [
          'call-palette',
          {
            outcome: 'answered',
            actor: {
              user: { collection: 'users' },
              channel: { piece: 'linear', account: 'linear', id: toad.id, name: 'Toad' },
            },
          },
        ],
      ]);
      expect(toolResults()).toEqual([
        { answers: [{ header: 'Palette', selected: ['snake_case'] }] },
      ]);
      expect(activities(session).map(({ content }) => content)).toEqual([
        expect.objectContaining({ type: 'elicitation' }),
        { type: 'response', body: 'Using the snake_case palette.' },
      ]);
    });

    it('asks again for a participant without access and answers a late option with stale', async () => {
      const session = 'session-denied';

      model.respond({
        toolCalls: [{ id: 'call-denied', name: 'question', input: paletteQuestion }],
      });

      await start(session);
      await reply({ body: 'C++', session, user: stranger });

      expect(await settlements(session)).toEqual([]);
      expect(activities(session)[1]).toMatchObject({
        content: {
          type: 'elicitation',
          body: expect.stringMatching(
            /^> Stranger can't answer this question without access to this agent\. It is still open\./,
          ),
        },
        signal: 'select',
      });

      model.respond({ text: 'Bold it is.' });

      await reply({ body: '\\*bold\\*', session });

      expect(toolResults()).toEqual([{ answers: [{ header: 'Palette', selected: ['*bold*'] }] }]);

      await reply({ body: 'Blue — navy', session, user: frog });

      expect(await settlements(session)).toHaveLength(1);
      expect(activities(session).at(-1)!.content).toEqual({
        type: 'response',
        body: 'This question was already answered.',
      });
      expect(model.requests).toHaveLength(2);
    });

    it('asks two questions from one step in sequence and continues once with both answers', async () => {
      const session = 'session-sequence';

      model.respond({
        toolCalls: [
          { id: 'call-first', name: 'question', input: paletteQuestion },
          { id: 'call-second', name: 'question', input: sizeQuestion },
        ],
      });

      await start(session);

      expect(activities(session)).toHaveLength(1);

      await reply({ body: 'Ünïcode 🐸', session });

      expect(model.requests).toHaveLength(1);
      expect(activities(session)).toHaveLength(2);
      expect(activities(session)[1]).toMatchObject({
        content: { body: expect.stringContaining('**Size**') },
        signal: 'select',
        signalMetadata: {
          options: [
            { label: 'Small', value: 'Small' },
            { label: 'Large', value: 'Large' },
          ],
        },
      });

      await reply({ body: 'Huge', session });

      expect(activities(session)[2].content.body).toMatch(
        /^> Reply to “Size” with one of the options\./,
      );

      model.respond({ text: 'Large and playful.' });

      await reply({ body: 'Large', session });

      expect(toolResults()).toEqual([
        { answers: [{ header: 'Palette', selected: ['Ünïcode 🐸'] }] },
        { answers: [{ header: 'Size', selected: ['Large'] }] },
      ]);
      expect(activities(session).at(-1)!.content).toEqual({
        type: 'response',
        body: 'Large and playful.',
      });
    });

    it('confirms a Linear stop request and does not call the model again', async () => {
      const session = 'session-stop';

      model.respond({ toolCalls: [{ id: 'call-stop', name: 'question', input: paletteQuestion }] });

      await start(session);
      await reply({ body: '', session, signal: 'stop' });

      expect(await settlements(session)).toMatchObject([['call-stop', { outcome: 'dismissed' }]]);
      expect(activities(session).at(-1)!.content).toEqual({
        type: 'response',
        body: 'Stopped. Toad dismissed the question.',
      });
      expect(model.requests).toHaveLength(1);
    });

    it('refuses a settle over HTTP from the chat owner and keeps the question open in Linear', async () => {
      const session = 'session-web';

      model.respond({ toolCalls: [{ id: 'call-web', name: 'question', input: sizeQuestion }] });

      await start(session);

      const login = await fetch(`${server.url}/api/users/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: frog.email, password: 'linear-e2e-password' }),
      });
      const { token, user } = (await login.json()) as { token: string; user: { id: string } };
      const chat = await chatOf(session);

      expect(chat).toMatchObject({ user: { id: user.id }, channel: 'linear' });

      const settle = await fetch(`${server.url}/api/agents/support/chats/${chat.id}/settle`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          toolCallId: 'call-web',
          output: { answers: [{ header: 'Size', selected: ['Small'] }] },
        }),
      });

      expect(login.status).toBe(200);
      expect(settle.status).toBe(409);
      expect(await settle.json()).toMatchObject({ code: 'channel-chat' });
      expect(await settlements(session)).toEqual([]);

      model.respond({ text: 'Small it is.' });

      await reply({ body: 'Small', session });

      expect(toolResults()).toEqual([{ answers: [{ header: 'Size', selected: ['Small'] }] }]);
    });

    it('rejects an unsigned reply before anything is queued', async () => {
      const session = 'session-forged';

      model.respond({
        toolCalls: [{ id: 'call-forged', name: 'question', input: paletteQuestion }],
      });

      await start(session);

      const payload = sessionPrompted({ body: 'C++', id: 'prompt-forged', session, user: toad });
      const response = await post(payload, {
        ...signed({ ...payload, agentActivity: { ...payload.agentActivity, id: 'other' } }),
      });

      expect(response.status).toBe(401);
      expect(await pendingJobs()).toBe(0);
      expect(await settlements(session)).toEqual([]);
      expect(activities(session)).toHaveLength(1);
    });
  },
);
