import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findTurnState, runQueuedTurn } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import {
  agentSlug,
  chatsSlug,
  lookupCalls,
  messagesSlug,
  questionAgentSlug,
  turnsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-int-password';
const questionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should I use?',
      options: [{ label: 'Red' }, { label: 'Blue' }],
    },
  ],
};

type AgentJSON = {
  chatId: number | string;
  status?: string;
  error?: string;
  code?: string;
  messageId?: string;
};

type StoredMessage = {
  role: string;
  model?: string | null;
  usage?: { model?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('per-user agent model allowlists', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let samId: number | string;
  let sam: Record<string, string>;
  let cookie: Record<string, string>;
  let hold: ReturnType<typeof deferred> | undefined;
  let running: Promise<unknown> | undefined;

  beforeAll(async () => {
    model = await startStubChatModel(3988);
    booted = await bootFrogBot(dirname, 'model-allowlist');
  });

  beforeEach(async () => {
    await clearData();
    await clearAndSeed(booted.frogbot, 'empty');

    const login = await loginHeaders({
      email: 'sam@frogbot.local',
      modelAccess: 'selected',
      models: ['test/thinker'],
    });

    samId = login.id;
    sam = login.jwt;
    cookie = login.cookie;
  });

  afterEach(async () => {
    hold?.resolve();
    await running;

    hold = undefined;
    running = undefined;

    await vi.waitFor(async () => {
      const untitled = await booted.frogbot.count({
        collection: chatsSlug,
        where: { title: { equals: null } },
        overrideAccess: true,
      });

      if (untitled.totalDocs > 0) throw new Error('Chat titles are still pending.');
    });

    await clearData();

    model.reset();
    lookupCalls.length = 0;
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  async function clearData() {
    for (const collection of [turnsSlug, messagesSlug, chatsSlug, usersSlug]) {
      await booted.frogbot.delete({ collection, where: {}, overrideAccess: true });
    }
  }

  async function post(endpoint: string, body: unknown, headers: Record<string, string> = sam) {
    const response = await fetch(`${booted.baseUrl}/api${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as AgentJSON };
  }

  async function loginHeaders(data: {
    email: string;
    modelAccess?: 'all' | 'selected' | null;
    models?: string[] | null;
  }) {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { ...data, password },
      overrideAccess: true,
    });

    const response = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: data.email, password }),
    });

    const login = (await response.json()) as { token: string };

    expect(response.status).toBe(200);
    expect(login.token).toEqual(expect.any(String));
    expect(response.headers.get('set-cookie')).toEqual(expect.any(String));

    return {
      id: user.id,
      jwt: { Authorization: `JWT ${login.token}` },
      cookie: { Cookie: response.headers.get('set-cookie')!.split(';')[0]! },
    };
  }

  async function manifest(headers: Record<string, string>) {
    const response = await fetch(`${booted.baseUrl}/api/agents`, { headers });

    expect(response.status).toBe(200);

    return response.json() as Promise<{
      agents: Array<{
        slug: string;
        models: string[];
        defaultModel: string;
        reasoning?: Record<string, unknown>;
      }>;
    }>;
  }

  async function rowCounts() {
    const counts = await Promise.all(
      [chatsSlug, messagesSlug, turnsSlug].map(async (collection) => {
        const result = await booted.frogbot.count({ collection, overrideAccess: true });

        return result.totalDocs;
      }),
    );

    return counts;
  }

  async function storedMessages(chatId: number | string) {
    const result = await booted.frogbot.find({
      collection: messagesSlug,
      where: { chat: { equals: chatId } },
      sort: ['createdAt', 'id'],
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    return result.docs as unknown as StoredMessage[];
  }

  async function setSamModels(models: string[]) {
    await booted.frogbot.update({
      collection: usersSlug,
      id: samId,
      data: { modelAccess: 'selected', models },
      overrideAccess: true,
    });
  }

  it('GET /api/agents filters models and reasoning, falls back, and hides unusable agents', async () => {
    const result = await manifest(cookie);

    expect(result.agents).toEqual([
      expect.objectContaining({
        slug: questionAgentSlug,
        models: ['test/thinker'],
        defaultModel: 'test/thinker',
        reasoning: {
          'test/thinker': [
            { key: 'low', label: 'Low' },
            { key: 'high', label: 'High' },
          ],
        },
      }),
    ]);
  });

  it.each(['JWT', 'cookie'])(
    '%s POST rejects a blocked model without writes or model calls',
    async (auth) => {
      const headers = auth === 'JWT' ? sam : cookie;

      const response = await post(
        `/agents/${questionAgentSlug}`,
        { prompt: 'Write it.', model: 'test/writer' },
        headers,
      );

      expect(response).toEqual({
        status: 403,
        body: { error: "Model 'test/writer' is not allowed for this user" },
      });
      expect(model.requests).toEqual([]);
      expect(await rowCounts()).toEqual([0, 0, 0]);
    },
  );

  it('POST accepts an explicitly allowed model', async () => {
    const response = await post(`/agents/${questionAgentSlug}`, {
      prompt: 'Think about paint.',
      model: 'test/thinker',
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(model.requests.map(({ model }) => model)).toEqual(['thinker']);
  });

  it('POST without a model runs and records the user fallback', async () => {
    const response = await post(`/agents/${questionAgentSlug}`, { prompt: 'Think about paint.' });
    const messages = await storedMessages(response.body.chatId);

    expect(response.status).toBe(200);
    expect(model.requests.map(({ model }) => model)).toEqual(['thinker']);
    expect(messages.find(({ role }) => role === 'user')).toMatchObject({ model: null });
    expect(messages.find(({ role }) => role === 'assistant')).toMatchObject({
      usage: { model: 'test/thinker', inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
  });

  it('POST rejects an agent with no user-allowed model', async () => {
    const response = await post(`/agents/${agentSlug}`, { prompt: 'Help.' });

    expect(response).toEqual({
      status: 403,
      body: { error: `No model on agent '${agentSlug}' is allowed for this user` },
    });
    expect(model.requests).toEqual([]);
    expect(await rowCounts()).toEqual([0, 0, 0]);
  });

  it('POST checks agent membership before user policy', async () => {
    const response = await post(`/agents/${agentSlug}`, {
      prompt: 'Write it.',
      model: 'test/writer',
    });

    expect(response).toEqual({
      status: 403,
      body: { error: `Model 'test/writer' is not allowed for agent '${agentSlug}'` },
    });
    expect(model.requests).toEqual([]);
    expect(await rowCounts()).toEqual([0, 0, 0]);
  });

  it('a steer naming a blocked model gets 403 while the turn runs on', async () => {
    hold = deferred();

    model.respond({ text: 'Done.', hold: hold.promise });

    const turn = post(`/agents/${questionAgentSlug}`, { prompt: 'Think.', model: 'test/thinker' });

    running = turn;

    await vi.waitFor(() => expect(model.requests).toHaveLength(1));

    const [chat] = (
      await booted.frogbot.find({ collection: chatsSlug, depth: 0, overrideAccess: true })
    ).docs;

    const steer = await post(`/agents/${questionAgentSlug}`, {
      chatId: chat!.id,
      prompt: 'Write it up.',
      model: 'test/writer',
      delivery: 'steer',
    });

    hold.resolve();

    expect(steer).toEqual({
      status: 403,
      body: { error: "Model 'test/writer' is not allowed for this user" },
    });
    expect((await turn).body.status).toBe('completed');
    expect(model.requests.map(({ model }) => model)).toEqual(['thinker']);
  });

  it('a stored steer with a blocked model fails the next step with selection-unavailable', async () => {
    hold = deferred();

    model.respond({
      toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'paint' } }],
      hold: hold.promise,
    });

    const turn = post(`/agents/${questionAgentSlug}`, {
      prompt: 'Look up paint.',
      model: 'test/thinker',
    });

    running = turn;

    await vi.waitFor(() => expect(model.requests).toHaveLength(1));

    const [chat] = (
      await booted.frogbot.find({ collection: chatsSlug, depth: 0, overrideAccess: true })
    ).docs;

    await booted.frogbot.create({
      collection: messagesSlug,
      data: {
        id: 'sam-steer-writer',
        chat: chat!.id,
        role: 'user',
        parts: [{ type: 'text', text: 'Write it up.' }],
        status: 'queued',
        delivery: 'steer',
        author: { user: { id: samId, collection: usersSlug } },
        model: 'test/writer',
      },
      overrideAccess: true,
    });

    hold.resolve();

    const response = await turn;

    expect(response.body).toMatchObject({
      code: 'selection-unavailable',
      error: "Model 'test/writer' is not allowed for this user",
    });
    expect(model.requests.map(({ model }) => model)).toEqual(['thinker']);
    await expect(
      findTurnState({ req: await booted.frogbot.createRequest({}), chatId: chat!.id }),
    ).resolves.toBe('idle');
  });

  it('/settle continues on the stored allowed model rather than the user new fallback', async () => {
    model.respond({ toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }] });

    const first = await post(`/agents/${questionAgentSlug}`, {
      prompt: 'Paint the fence.',
      model: 'test/thinker',
    });

    await setSamModels(['test/gpt-4.1-mini', 'test/thinker']);

    model.respond({ text: 'Painting it blue.' });

    const response = await post(`/agents/${questionAgentSlug}/chats/${first.body.chatId}/settle`, {
      toolCallId: 'call-question',
      output: { answers: [{ header: 'Color', selected: ['Blue'] }] },
    });
    const messages = await storedMessages(first.body.chatId);

    expect(first.body.status).toBe('awaiting-input');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(model.requests.map(({ model }) => model)).toEqual(['thinker', 'thinker']);
    expect(messages.find(({ role }) => role === 'user')).toMatchObject({ model: 'test/thinker' });
    expect(messages.find(({ role }) => role === 'assistant')).toMatchObject({
      usage: { model: 'test/thinker' },
    });
  });

  it('the queue worker rechecks the author revoked model and releases the turn', async () => {
    const first = await post(`/agents/${questionAgentSlug}`, { prompt: 'Start.' });

    await booted.frogbot.create({
      collection: messagesSlug,
      data: {
        id: 'sam-queued-thinker',
        chat: first.body.chatId,
        role: 'user',
        parts: [{ type: 'text', text: 'Think harder.' }],
        status: 'queued',
        delivery: 'queue',
        author: { user: { id: samId, collection: usersSlug } },
        model: 'test/thinker',
      },
      overrideAccess: true,
    });

    await setSamModels(['test/writer']);

    model.reset();

    await expect(
      runQueuedTurn({ frogbot: booted.frogbot, chatId: first.body.chatId }),
    ).rejects.toMatchObject({
      code: 'selection-unavailable',
      message: "Model 'test/thinker' is not allowed for this user",
    });

    expect(model.requests).toEqual([]);
    await expect(
      findTurnState({ req: await booted.frogbot.createRequest({}), chatId: first.body.chatId }),
    ).resolves.toBe('idle');
  });

  it.each([
    { name: 'an unrestricted user', modelAccess: 'all' as const, models: ['test/thinker'] },
    { name: 'a user without a model policy', modelAccess: null, models: null },
  ])('GET /api/agents shows the full manifest for $name', async ({ modelAccess, models }) => {
    const login = await loginHeaders({ email: 'unrestricted@frogbot.local', modelAccess, models });

    const result = await manifest(login.jwt);

    expect(result.agents.map(({ slug }) => slug)).toEqual([agentSlug, questionAgentSlug]);
    expect(result.agents.find(({ slug }) => slug === questionAgentSlug)).toMatchObject({
      defaultModel: 'test/gpt-4.1-mini',
      models: ['test/gpt-4.1-mini', 'test/thinker', 'test/writer'],
      reasoning: {
        'test/thinker': [
          { key: 'low', label: 'Low' },
          { key: 'high', label: 'High' },
        ],
        'test/writer': [{ key: 'max', label: 'Max' }],
      },
    });
    expect(result.agents.find(({ slug }) => slug === agentSlug)).toMatchObject({
      defaultModel: 'test/gpt-4.1-mini',
      models: ['test/gpt-4.1-mini'],
    });
  });
});
