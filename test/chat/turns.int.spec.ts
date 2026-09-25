import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claimTurn, findTurnState, updateIfVersion } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import { lookupCalls, messagesSlug, questionAgentSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const questionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should I use?',
      options: [{ label: 'Red' }, { label: 'Blue', description: 'Calm' }],
    },
  ],
};

const answer = { answers: [{ header: 'Color', selected: ['Blue'] }] };

type AgentJSON = {
  status: string;
  chatId: number | string;
  text?: string;
  pending?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  code?: string;
  messageId?: string;
  settlement?: { status: string; allSettled: boolean; part: { state: string } };
};

type StoredMessage = {
  id: string;
  role: string;
  status?: string;
  parts: Array<{ type: string; state?: string; output?: unknown; text?: string }>;
  version: number;
  settlements?: Record<string, { outcome: string; actor: unknown }>;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('chat turns: client tools, settlement, and queued messages', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(3988);
    booted = await bootFrogBot(dirname, 'chat-turns');
  });

  afterEach(() => {
    model.reset();
    lookupCalls.length = 0;
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${booted.baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as AgentJSON };
  }

  async function ask(callId = 'call-question') {
    model.respond({ toolCalls: [{ id: callId, name: 'question', input: questionInput }] });

    return post(`/agents/${questionAgentSlug}`, { prompt: 'Paint the fence.' });
  }

  async function settle(chatId: number | string, body: unknown, headers?: Record<string, string>) {
    return post(`/agents/${questionAgentSlug}/chats/${chatId}/settle`, body, headers);
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

  async function loginHeaders(email: string) {
    await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-int-password' },
      overrideAccess: true,
    });

    const login = await post(`/${usersSlug}/login`, {
      email,
      password: 'frogbot-int-password',
    });

    return { Authorization: `JWT ${(login.body as unknown as { token: string }).token}` };
  }

  it('JSON POST reports a pending question and leaves the chat awaiting', async () => {
    const response = await ask();

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('awaiting-input');
    expect(response.body.pending).toEqual([
      expect.objectContaining({ toolCallId: 'call-question', toolName: 'question' }),
    ]);
    await expect(
      findTurnState({
        req: await booted.frogbot.createRequest({}),
        chatId: response.body.chatId,
      }),
    ).resolves.toBe('awaiting');
  });

  it('GET pending lists the persisted question', async () => {
    const { body } = await ask();

    const response = await fetch(
      `${booted.baseUrl}/api/agents/${questionAgentSlug}/chats/${body.chatId}/pending`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: 'awaiting',
      pending: [
        {
          toolCallId: 'call-question',
          input: { questions: [expect.objectContaining({ header: 'Color', custom: true })] },
        },
      ],
    });
  });

  it('settling an answer continues the same assistant message with the answer', async () => {
    const { body } = await ask();

    model.respond({ text: 'Painting it blue.' });

    const response = await settle(body.chatId, { toolCallId: 'call-question', output: answer });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'completed', text: 'Painting it blue.' });

    const toolMessage = model.requests.at(-1)!.messages.find(({ role }) => role === 'tool');

    expect(JSON.stringify(toolMessage?.content)).toContain('Blue');

    const messages = await storedMessages(body.chatId);

    expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-question',
          state: 'output-available',
          output: answer,
        }),
        expect.objectContaining({ type: 'text', text: 'Painting it blue.' }),
      ]),
    );
    expect(messages[1]!.settlements?.['call-question']).toMatchObject({ outcome: 'answered' });
  });

  it('a second answer is rejected as already settled without another model call', async () => {
    const { body } = await ask();

    model.respond({ text: 'First answer wins.' });

    await settle(body.chatId, { toolCallId: 'call-question', output: answer });

    const requests = model.requests.length;
    const duplicate = await settle(body.chatId, {
      toolCallId: 'call-question',
      output: { answers: [{ header: 'Color', selected: ['Red'] }] },
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('already-settled');
    expect(model.requests).toHaveLength(requests);
  });

  it('concurrent answers settle once and continue once', async () => {
    const { body } = await ask();

    model.respond({ text: 'Only once.' });

    const results = await Promise.all([
      settle(body.chatId, { toolCallId: 'call-question', output: answer }),
      settle(body.chatId, { toolCallId: 'call-question', output: answer }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(model.requests).toHaveLength(2);
  });

  it('an answer with an option that was not offered is rejected and stays pending', async () => {
    const { body } = await ask();

    const response = await settle(body.chatId, {
      toolCallId: 'call-question',
      output: { answers: [{ header: 'Color', selected: ['Green'] }] },
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid-output');
    expect(model.requests).toHaveLength(1);

    const messages = await storedMessages(body.chatId);

    expect(messages[1]!.parts).toContainEqual(
      expect.objectContaining({ type: 'tool-question', state: 'input-available' }),
    );
  });

  it('an unknown tool call id is not found', async () => {
    const { body } = await ask();

    const response = await settle(body.chatId, { toolCallId: 'forged', output: answer });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('call-not-found');
  });

  it('another user cannot settle a question in a chat they do not own', async () => {
    const { body } = await ask();

    const response = await settle(
      body.chatId,
      { toolCallId: 'call-question', output: answer },
      await loginHeaders('intruder-turns@frogbot.local'),
    );

    expect(response.status).toBe(404);
    expect(model.requests).toHaveLength(1);
  });

  it('dismissal records the refusal and closes the turn without a model call', async () => {
    const { body } = await ask();

    const response = await settle(body.chatId, { toolCallId: 'call-question', dismissed: true });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('dismissed');
    expect(model.requests).toHaveLength(1);

    const messages = await storedMessages(body.chatId);

    expect(messages[1]!.parts).toContainEqual(
      expect.objectContaining({ type: 'tool-question', state: 'output-error' }),
    );
    expect(messages[1]!.settlements?.['call-question']).toMatchObject({ outcome: 'dismissed' });
    await expect(
      findTurnState({ req: await booted.frogbot.createRequest({}), chatId: body.chatId }),
    ).resolves.toBe('idle');
  });

  it('dismissing one of two questions cancels its sibling and records who settled both', async () => {
    const headers = await loginHeaders('dismisser-turns@frogbot.local');

    model.respond({
      toolCalls: [
        { id: 'call-first', name: 'question', input: questionInput },
        { id: 'call-second', name: 'question', input: questionInput },
      ],
    });

    const { body } = await post(
      `/agents/${questionAgentSlug}`,
      { prompt: 'Paint the fence.' },
      headers,
    );

    const response = await settle(
      body.chatId,
      { toolCallId: 'call-first', dismissed: true },
      headers,
    );

    expect(response.status).toBe(200);
    expect(response.body.settlement?.allSettled).toBe(true);
    expect(model.requests).toHaveLength(1);

    const [, assistant] = await storedMessages(body.chatId);
    const actor = { user: { collection: usersSlug, id: expect.anything() } };

    expect(assistant!.parts.filter(({ type }) => type === 'tool-question')).toEqual([
      expect.objectContaining({ state: 'output-error', errorText: 'Dismissed by the user.' }),
      expect.objectContaining({ state: 'output-error' }),
    ]);
    expect(assistant!.settlements).toEqual({
      'call-first': { outcome: 'dismissed', actor, at: expect.any(String) },
      'call-second': { outcome: 'cancelled', actor, at: expect.any(String) },
    });
  });

  it('an answer records the responding user on the settlement', async () => {
    const headers = await loginHeaders('answerer-turns@frogbot.local');

    model.respond({ toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }] });

    const { body } = await post(
      `/agents/${questionAgentSlug}`,
      { prompt: 'Paint the fence.' },
      headers,
    );

    model.respond({ text: 'Blue it is.' });

    await settle(body.chatId, { toolCallId: 'call-question', output: answer }, headers);

    const [, assistant] = await storedMessages(body.chatId);

    expect(assistant!.settlements?.['call-question']).toEqual({
      outcome: 'answered',
      actor: { user: { collection: usersSlug, id: expect.anything() } },
      at: expect.any(String),
    });
  });

  it('a server tool emitted with a question in the same step is skipped', async () => {
    model.respond({
      toolCalls: [
        { id: 'call-question', name: 'question', input: questionInput },
        { id: 'call-lookup', name: 'lookup', input: { topic: 'paint' } },
      ],
    });

    const { body } = await post(`/agents/${questionAgentSlug}`, { prompt: 'Paint the fence.' });

    expect(body.status).toBe('awaiting-input');
    expect(lookupCalls).toEqual([]);

    const messages = await storedMessages(body.chatId);

    expect(messages[1]!.parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-lookup',
        state: 'output-available',
        output: expect.objectContaining({ skipped: true }),
      }),
    );
  });

  it('SSE resubmission of the answered assistant message continues the same message', async () => {
    const { body } = await ask();
    const [, assistant] = await storedMessages(body.chatId);

    model.respond({ text: 'Blue it is.' });

    const response = await fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: body.chatId,
        messages: [
          {
            ...assistant,
            parts: assistant!.parts.map((part) =>
              part.type === 'tool-question'
                ? { ...part, state: 'output-available', output: answer }
                : part,
            ),
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await response.text();

    const messages = await storedMessages(body.chatId);

    expect(messages.map(({ id }) => id)).toEqual([messages[0]!.id, assistant!.id]);
    expect(messages[1]!.parts).toContainEqual(
      expect.objectContaining({ type: 'text', text: 'Blue it is.' }),
    );
  });

  it('a resubmission settles only the calls that are still pending', async () => {
    model.respond({
      toolCalls: [
        { id: 'call-first', name: 'question', input: questionInput },
        { id: 'call-second', name: 'question', input: questionInput },
      ],
    });

    const { body } = await post(`/agents/${questionAgentSlug}`, { prompt: 'Paint the fence.' });

    const first = await settle(body.chatId, { toolCallId: 'call-first', output: answer });

    expect(first.body.status).toBe('awaiting-input');

    const [, assistant] = await storedMessages(body.chatId);
    const redAnswer = { answers: [{ header: 'Color', selected: ['Red'] }] };

    model.respond({ text: 'Both answered.' });

    const response = await fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: body.chatId,
        messages: [
          {
            ...assistant,
            parts: assistant!.parts.map((part) =>
              part.type === 'tool-question'
                ? { ...part, state: 'output-available', output: redAnswer }
                : part,
            ),
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await response.text();

    const [, continued] = await storedMessages(body.chatId);
    const outputs = continued!.parts
      .filter((part) => part.type === 'tool-question')
      .map((part) => part.output);

    expect(outputs).toEqual([answer, redAnswer]);
    expect(continued!.parts).toContainEqual(
      expect.objectContaining({ type: 'text', text: 'Both answered.' }),
    );
  });

  it('a message sent while a question is pending is queued and kept out of the continuation', async () => {
    const { body } = await ask();

    const queued = await post(`/agents/${questionAgentSlug}`, {
      chatId: body.chatId,
      prompt: 'Also sand it first.',
    });

    expect(queued.status).toBe(202);
    expect(queued.body.status).toBe('queued');

    model.respond({ text: 'Blue.' }, { text: 'Sanding first.' });

    await settle(body.chatId, { toolCallId: 'call-question', output: answer });

    expect(JSON.stringify(model.requests[1]!.messages)).not.toContain('Also sand it first.');

    await vi.waitFor(() => expect(model.requests).toHaveLength(3), { timeout: 10_000 });

    expect(JSON.stringify(model.requests[2]!.messages)).toContain('Also sand it first.');
    await vi.waitFor(async () =>
      expect((await storedMessages(body.chatId)).map(({ role }) => role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]),
    );
  });

  it('two concurrent posts on one chat produce one run and one queued message', async () => {
    const first = await post(`/agents/${questionAgentSlug}`, { prompt: 'Start.' });
    const hold = deferred();

    model.respond({ text: 'Slow reply.', hold: hold.promise }, { text: 'Queued reply.' });

    const running = post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'A',
    });

    await vi.waitFor(() => expect(model.requests).toHaveLength(2));

    const second = await post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'B',
    });

    expect(second.status).toBe(202);

    hold.resolve();

    await expect(running).resolves.toMatchObject({ status: 200 });
    await vi.waitFor(() => expect(model.requests).toHaveLength(3));
  });

  it('the author can edit and remove a queued message before it runs', async () => {
    const { body } = await ask();

    const queued = await post(`/agents/${questionAgentSlug}`, {
      chatId: body.chatId,
      prompt: 'Original.',
    });
    const url = `${booted.baseUrl}/api/agents/${questionAgentSlug}/chats/${body.chatId}/messages/${queued.body.messageId}`;

    const edited = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text: 'Edited.' }] }),
    });

    expect(edited.status).toBe(200);
    await expect(edited.json()).resolves.toMatchObject({
      message: { parts: [{ type: 'text', text: 'Edited.' }], status: 'queued' },
    });

    const removed = await fetch(url, { method: 'DELETE' });

    expect(removed.status).toBe(204);
    expect((await storedMessages(body.chatId)).map(({ role }) => role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('a steer message joins the running turn at the next step boundary', async () => {
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

    const steer = await post(`/agents/${questionAgentSlug}`, {
      chatId: first.body.chatId,
      prompt: 'Use oil paint.',
      delivery: 'steer',
    });

    expect(steer.status).toBe(202);

    hold.resolve();
    await running;

    expect(model.requests).toHaveLength(3);
    expect(JSON.stringify(model.requests[2]!.messages)).toContain('Use oil paint.');
  });

  it('agent.generate withholds the question tool and turns a stray call into a tool error', async () => {
    model.respond(
      { toolCalls: [{ id: 'call-stray', name: 'question', input: questionInput }] },
      { text: 'Asked in text instead.' },
    );

    const result = await booted.frogbot.agents[questionAgentSlug]!.generate({ prompt: 'Go.' });

    expect(model.requests[0]!.tools?.map(({ function: fn }) => fn.name)).toEqual(['lookup']);
    expect(result.steps[0]!.content).toContainEqual(
      expect.objectContaining({ type: 'tool-error', toolCallId: 'call-stray' }),
    );
    expect(model.requests).toHaveLength(2);
    expect(result.text).toBe('Asked in text instead.');
  });

  it('updateIfVersion lets exactly one of two racing writers win', async () => {
    const { body } = await ask();
    const [, assistant] = await storedMessages(body.chatId);
    const req = await booted.frogbot.createRequest({});

    const results = await Promise.all(
      ['first', 'second'].map((text) =>
        updateIfVersion({
          req,
          collection: messagesSlug,
          id: assistant!.id,
          version: assistant!.version,
          data: { metadata: { text } },
        }),
      ),
    );

    expect(results.sort()).toEqual([false, true]);
  });

  it('an expired running lease can be claimed exactly once', async () => {
    const { body } = await post(`/agents/${questionAgentSlug}`, { prompt: 'Start.' });
    const req = await booted.frogbot.createRequest({});

    await claimTurn({ req, chatId: body.chatId, from: 'idle' });
    await booted.frogbot.update({
      collection: 'frogbot-chat-turns',
      id: String(body.chatId),
      data: { leaseUntil: new Date(Date.now() - 1_000).toISOString() },
      overrideAccess: true,
    });

    const claims = await Promise.all([
      claimTurn({ req, chatId: body.chatId, from: 'idle' }),
      claimTurn({ req, chatId: body.chatId, from: 'idle' }),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
