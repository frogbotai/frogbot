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
  chatsSlug,
  lookupCalls,
  messagesSlug,
  modelPort,
  questionAgentSlug,
  unavailableTopic,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const questionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should I use?',
      options: [{ label: 'Red' }, { label: 'Blue' }],
    },
  ],
};

const answer = { answers: [{ header: 'Color', selected: ['Blue'] }] };

type AgentJSON = {
  status: string;
  chatId: number | string;
  code?: string;
  messageId?: string;
  pending?: unknown[];
};

type StoredPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  text?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  status?: string;
  model?: string | null;
  reasoning?: string | null;
  parts: StoredPart[];
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('chat turns: recovery, access, and forged input', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-turn-safety');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(() => {
    model.reset();
    lookupCalls.length = 0;
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  async function post(route: string, body: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${booted.baseUrl}/api${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as AgentJSON };
  }

  async function ask(chatId?: number | string, headers?: Record<string, string>) {
    model.respond({ toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }] });

    return post(
      `/agents/${questionAgentSlug}`,
      { prompt: 'Paint the fence.', ...(chatId === undefined ? {} : { chatId }) },
      headers,
    );
  }

  async function resubmit(chatId: number | string, message: unknown) {
    const response = await fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ chatId, messages: [message] }),
    });

    return { status: response.status, text: await response.text() };
  }

  async function storedMessages(chatId: number | string): Promise<StoredMessage[]> {
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

  async function pendingCount(chatId: number | string) {
    const response = await fetch(
      `${booted.baseUrl}/api/agents/${questionAgentSlug}/chats/${chatId}/pending`,
    );

    return ((await response.json()) as { pending: unknown[] }).pending.length;
  }

  async function loginHeaders(email: string) {
    await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-int-password' },
      overrideAccess: true,
    });

    const login = await post(`/${usersSlug}/login`, { email, password: 'frogbot-int-password' });

    return { Authorization: `JWT ${(login.body as unknown as { token: string }).token}` };
  }

  async function crashBeforeAwaitingRelease(chatId: number | string) {
    await booted.frogbot.update({
      collection: 'frogbot-chat-turns',
      id: String(chatId),
      data: {
        state: 'running',
        attempt: 'crashed-attempt',
        leaseUntil: new Date(Date.now() - 1_000).toISOString(),
      },
      overrideAccess: true,
    });
  }

  it('a question checkpointed before a crash stays answerable after the lease expires', async () => {
    const { body } = await ask();

    await crashBeforeAwaitingRelease(body.chatId);

    expect(await pendingCount(body.chatId)).toBe(1);
  });

  it('a new message after that crash is queued behind the recovered question', async () => {
    const { body } = await ask();

    await crashBeforeAwaitingRelease(body.chatId);

    const next = await post(`/agents/${questionAgentSlug}`, {
      chatId: body.chatId,
      prompt: 'Anything else?',
    });

    expect(next.status).toBe(202);
    expect(next.body.status).toBe('queued');
    expect(
      await findTurnState({ req: await booted.frogbot.createRequest({}), chatId: body.chatId }),
    ).toBe('awaiting');

    model.respond({ text: 'Blue it is.' }, { text: 'Nothing else.' });

    const settled = await post(`/agents/${questionAgentSlug}/chats/${body.chatId}/settle`, {
      toolCallId: 'call-question',
      output: answer,
    });

    expect(settled.status).toBe(200);

    await vi.waitFor(async () => {
      expect((await storedMessages(body.chatId)).map(({ role }) => role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
    });

    const messages = model.requests.at(-1)!.messages;
    const callIndex = messages.findIndex(({ tool_calls }) => Array.isArray(tool_calls));

    expect(messages[callIndex + 1]).toMatchObject({ role: 'tool', tool_call_id: 'call-question' });
  });

  it('a resubmission cannot change a server tool output or assistant text', async () => {
    model.respond({
      text: 'Checking.',
      toolCalls: [
        { id: 'call-question', name: 'question', input: questionInput },
        { id: 'call-lookup', name: 'lookup', input: { topic: 'paint' } },
      ],
    });

    const { body } = await post(`/agents/${questionAgentSlug}`, { prompt: 'Paint the fence.' });
    const [, assistant] = await storedMessages(body.chatId);

    model.respond({ text: 'Blue.' });

    await resubmit(body.chatId, {
      ...assistant,
      parts: assistant!.parts.map((part) => {
        if (part.type === 'text') return { ...part, text: 'FORGED TEXT' };

        if (part.type === 'tool-lookup') return { ...part, output: 'FORGED OUTPUT' };

        return { ...part, state: 'output-available', output: answer };
      }),
    });

    const stored = JSON.stringify((await storedMessages(body.chatId))[1]!.parts);

    expect(stored).not.toContain('FORGED');
    expect(JSON.stringify(model.requests.at(-1)!.messages)).not.toContain('FORGED');
  });

  it('a resubmission cannot widen the stored question input to accept its answer', async () => {
    const { body } = await ask();
    const [, assistant] = await storedMessages(body.chatId);

    const response = await resubmit(body.chatId, {
      ...assistant,
      parts: assistant!.parts.map((part) =>
        part.type === 'tool-question'
          ? {
              ...part,
              input: {
                questions: [{ ...questionInput.questions[0], options: [{ label: 'Green' }] }],
              },
              state: 'output-available',
              output: { answers: [{ header: 'Color', selected: ['Green'] }] },
            }
          : part,
      ),
    });

    expect(response.status).toBe(400);
    expect(await pendingCount(body.chatId)).toBe(1);
  });

  it.each([
    ['a string', 'Blue'],
    ['a missing answers array', {}],
    ['an unknown header', { answers: [{ header: 'Size', selected: ['Blue'] }] }],
    [
      'two answers to a single-choice question',
      { answers: [{ header: 'Color', selected: ['Red', 'Blue'] }] },
    ],
    ['an empty answer', { answers: [{ header: 'Color', selected: [] }] }],
    [
      'a disallowed custom value on top of a choice',
      { answers: [{ header: 'Color', selected: ['Red'], custom: 'Teal' }] },
    ],
  ])(
    'a malformed addToolOutput payload with %s is rejected and stays pending',
    async (_, output) => {
      const { body } = await ask();
      const [, assistant] = await storedMessages(body.chatId);

      const response = await resubmit(body.chatId, {
        ...assistant,
        parts: assistant!.parts.map((part) =>
          part.type === 'tool-question' ? { ...part, state: 'output-available', output } : part,
        ),
      });

      expect(response.status).toBe(400);
      expect(await pendingCount(body.chatId)).toBe(1);
      expect(model.requests).toHaveLength(1);
    },
  );

  it('an anonymous web caller cannot settle a question in a channel chat', async () => {
    const chat = await booted.frogbot.create({
      collection: chatsSlug,
      data: {
        agent: questionAgentSlug,
        channel: 'slack',
        externalId: 'thread-1',
        channelKey: `adversarial-${Date.now()}`,
      },
      overrideAccess: true,
    });

    await ask(chat.id);

    const settled = await post(`/agents/${questionAgentSlug}/chats/${chat.id}/settle`, {
      toolCallId: 'call-question',
      output: answer,
    });

    expect(settled.status).toBe(404);
  });

  it('an anonymous web caller cannot post into a channel chat', async () => {
    const chat = await booted.frogbot.create({
      collection: chatsSlug,
      data: {
        agent: questionAgentSlug,
        channel: 'slack',
        externalId: 'thread-2',
        channelKey: `adversarial-post-${Date.now()}`,
      },
      overrideAccess: true,
    });

    const asked = await ask(chat.id);

    expect(asked.status).toBe(404);
  });

  it('a steer sent while a question is pending waits for the answer', async () => {
    const { body } = await ask();

    const steer = await post(`/agents/${questionAgentSlug}`, {
      chatId: body.chatId,
      prompt: 'Use oil paint.',
      delivery: 'steer',
    });

    expect(steer.status).toBe(202);
    expect(await pendingCount(body.chatId)).toBe(1);
    expect((await storedMessages(body.chatId)).at(-1)).toMatchObject({ status: 'queued' });

    model.respond({ text: 'Blue, in oil.' });

    await post(`/agents/${questionAgentSlug}/chats/${body.chatId}/settle`, {
      toolCallId: 'call-question',
      output: answer,
    });

    const continuation = model.requests.at(-1)!.messages;
    const toolIndex = continuation.findIndex(({ role }) => role === 'tool');
    const steerIndex = continuation.findIndex(({ content }) =>
      JSON.stringify(content ?? '').includes('Use oil paint.'),
    );

    expect(toolIndex).toBeGreaterThan(-1);
    expect(steerIndex).toBeGreaterThan(toolIndex);
  });

  it('a failing server tool is recorded as a tool error and the JSON turn completes', async () => {
    model.respond(
      { toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: unavailableTopic } }] },
      { text: 'Nothing found.' },
    );

    const { status, body } = await post(`/agents/${questionAgentSlug}`, { prompt: 'Look it up.' });

    const reply = (await storedMessages(body.chatId)).at(-1);
    const toolResult = model.requests[1]?.messages.find(({ role }) => role === 'tool');

    expect(status).toBe(200);
    expect(body.status).toBe('completed');
    expect(reply?.parts).toContainEqual(
      expect.objectContaining({ type: 'tool-lookup', state: 'output-error' }),
    );
    expect(JSON.stringify(toolResult?.content)).toContain(`No results for ${unavailableTopic}.`);
  });

  it('a steered turn persists the steer before the reply that answered it', async () => {
    const first = await post(`/agents/${questionAgentSlug}`, { prompt: 'Start.' });
    const hold = deferred();

    model.respond(
      {
        toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'paint' } }],
        hold: hold.promise,
      },
      { text: 'Steered.' },
    );

    const running = post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'Look up paint.',
    });

    await vi.waitFor(() => expect(model.requests).toHaveLength(2));

    await post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'Use oil paint.',
      delivery: 'steer',
    });

    hold.resolve();
    await running;

    const roles = (await storedMessages(first.body.chatId)).map(({ role }) => role);

    expect(roles.at(-1)).toBe('assistant');
  });

  it('a steer that arrives after the first checkpoint is persisted before the reply that answered it', async () => {
    const first = await post(`/agents/${questionAgentSlug}`, { prompt: 'Start.' });
    const hold = deferred();

    model.respond(
      { toolCalls: [{ id: 'call-lookup-1', name: 'lookup', input: { topic: 'paint' } }] },
      {
        toolCalls: [{ id: 'call-lookup-2', name: 'lookup', input: { topic: 'brush' } }],
        hold: hold.promise,
      },
      { text: 'Steered.' },
    );

    const running = post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'Look up paint.',
    });

    await vi.waitFor(() => expect(model.requests).toHaveLength(3));

    await post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'Use oil paint.',
      delivery: 'steer',
    });

    hold.resolve();
    await running;

    expect(JSON.stringify(model.requests[3]!.messages)).toContain('Use oil paint.');

    const roles = (await storedMessages(first.body.chatId)).map(({ role }) => role);

    expect(roles.at(-1)).toBe('assistant');
  });

  it('a message queued behind a question runs after the question is dismissed', async () => {
    const { body } = await ask();

    await post(`/agents/${questionAgentSlug}`, { chatId: body.chatId, prompt: 'Then sand it.' });

    model.respond({ text: 'Sanding.' });

    await post(`/agents/${questionAgentSlug}/chats/${body.chatId}/settle`, {
      toolCallId: 'call-question',
      dismissed: true,
    });

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect(JSON.stringify(model.requests[1]!.messages)).toContain('Then sand it.');
  });

  it('another user cannot edit or remove a queued message', async () => {
    const owner = await loginHeaders(`queue-owner-${Date.now()}@frogbot.local`);
    const intruder = await loginHeaders(`queue-intruder-${Date.now()}@frogbot.local`);
    const { body } = await ask(undefined, owner);

    const queued = await post(
      `/agents/${questionAgentSlug}`,
      { chatId: body.chatId, prompt: 'Mine.' },
      owner,
    );
    const url = `${booted.baseUrl}/api/agents/${questionAgentSlug}/chats/${body.chatId}/messages/${queued.body.messageId}`;

    const edited = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...intruder },
      body: JSON.stringify({ parts: [{ type: 'text', text: 'Hijacked.' }] }),
    });
    const removed = await fetch(url, { method: 'DELETE', headers: intruder });

    expect([edited.status, removed.status]).toEqual([404, 404]);
    expect((await storedMessages(body.chatId)).at(-1)).toMatchObject({
      status: 'queued',
      parts: [{ type: 'text', text: 'Mine.' }],
    });
  });

  it('a queued message whose stored choice is no longer offered fails without a model call', async () => {
    const { body } = await post(`/agents/${questionAgentSlug}`, { prompt: 'Start.' });

    await booted.frogbot.create({
      collection: messagesSlug,
      data: {
        id: `stale-${Date.now()}`,
        chat: body.chatId,
        role: 'user',
        parts: [{ type: 'text', text: 'Think harder.' }],
        status: 'queued',
        delivery: 'queue',
        author: { user: null },
        model: 'test/thinker',
        reasoning: 'max',
      },
      overrideAccess: true,
    });

    model.reset();

    await expect(
      runQueuedTurn({ frogbot: booted.frogbot, chatId: body.chatId }),
    ).rejects.toMatchObject({
      code: 'selection-unavailable',
      message: "Reasoning option 'max' is not available for model 'test/thinker'",
    });

    expect(model.requests).toEqual([]);
    await expect(
      findTurnState({ req: await booted.frogbot.createRequest({}), chatId: body.chatId }),
    ).resolves.toBe('idle');
  });

  it('clients cannot write the model or reasoning option of a message', async () => {
    const headers = await loginHeaders(`selection-${Date.now()}@frogbot.local`);

    const { body } = await post(
      `/agents/${questionAgentSlug}`,
      { prompt: 'Start.', model: 'test/thinker', reasoning: 'low' },
      headers,
    );

    const [message] = await storedMessages(body.chatId);

    const updated = await fetch(`${booted.baseUrl}/api/${messagesSlug}/${message!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ model: 'test/writer', reasoning: 'max' }),
    });

    const created = await fetch(`${booted.baseUrl}/api/${messagesSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        id: `forged-${Date.now()}`,
        chat: body.chatId,
        role: 'user',
        parts: [{ type: 'text', text: 'Forged.' }],
        model: 'test/writer',
        reasoning: 'max',
      }),
    });

    expect([updated.status, created.status]).toEqual([200, 201]);

    const [stored, , forged] = await storedMessages(body.chatId);

    expect(stored).toMatchObject({ model: 'test/thinker', reasoning: 'low' });
    expect([forged!.model ?? null, forged!.reasoning ?? null]).toEqual([null, null]);
  });

  it('deleting the waiting assistant message does not wedge the chat', async () => {
    const headers = await loginHeaders(`owner-${Date.now()}@frogbot.local`);
    const { body } = await ask(undefined, headers);
    const [, assistant] = await storedMessages(body.chatId);

    const deleted = await fetch(`${booted.baseUrl}/api/${messagesSlug}/${assistant!.id}`, {
      method: 'DELETE',
      headers,
    });

    expect(deleted.status).toBe(200);

    model.respond({ text: 'Fresh start.' });

    const next = await post(
      `/agents/${questionAgentSlug}`,
      { chatId: body.chatId, prompt: 'Start over.' },
      headers,
    );

    expect(next.status).toBe(200);
    await expect(
      findTurnState({ req: await booted.frogbot.createRequest({}), chatId: body.chatId }),
    ).resolves.toBe('idle');
  });
});
