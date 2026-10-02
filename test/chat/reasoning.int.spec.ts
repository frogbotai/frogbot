import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findTurnState } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { placeholderChatTitle } from '../../packages/frogbot/src/chat/title.js';
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

type AgentJSON = {
  status?: string;
  chatId: number | string;
  error?: string;
  code?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  status?: string;
  parts: Array<Record<string, unknown>>;
};

type CustomModel = { id: string; reasoningOptions?: unknown };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('chat reasoning selection', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let thinker: CustomModel;
  let thinkerOptions: unknown;

  beforeAll(async () => {
    model = await startStubChatModel(3988);
    booted = await bootFrogBot(dirname, 'chat-reasoning');

    const providers = booted.frogbot.config.ai!.providers as unknown as Record<
      string,
      { models: CustomModel[] }
    >;

    thinker = providers.test!.models.find(({ id }) => id === 'thinker')!;
    thinkerOptions = thinker.reasoningOptions;
  });

  beforeEach(async () => {
    for (const collection of [turnsSlug, messagesSlug]) {
      await booted.frogbot.delete({ collection, where: {}, overrideAccess: true });
    }

    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    thinker.reasoningOptions = thinkerOptions;
    model.reset();
    lookupCalls.length = 0;

    await vi.waitFor(async () => {
      const chats = await booted.frogbot.find({
        collection: chatsSlug,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });

      const naming = await Promise.all(
        chats.docs.map(async ({ id, title }) => {
          const placeholder = placeholderChatTitle(await storedMessages(id));

          return !title || title === placeholder;
        }),
      );

      if (naming.some(Boolean)) throw new Error('Chat titles are still being generated');
    });
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  async function post(body: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as AgentJSON };
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

  async function rowCounts() {
    const [chats, messages] = await Promise.all([
      booted.frogbot.count({ collection: chatsSlug, overrideAccess: true }),
      booted.frogbot.count({ collection: messagesSlug, overrideAccess: true }),
    ]);

    return { chats: chats.totalDocs, messages: messages.totalDocs };
  }

  async function turnState(chatId: number | string) {
    return findTurnState({ req: await booted.frogbot.createRequest({}), chatId });
  }

  function choices(from = 0) {
    return model.requests.slice(from).map((request) => [request.model, request.reasoning_effort]);
  }

  it('GET /api/agents lists reasoning options only for allowed models that declare them', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents`);

    const { agents } = (await response.json()) as {
      agents: Array<{ slug: string; reasoning?: Record<string, unknown> }>;
    };

    expect(agents.find(({ slug }) => slug === agentSlug)).not.toHaveProperty('reasoning');
    expect(agents.find(({ slug }) => slug === questionAgentSlug)?.reasoning).toEqual({
      'test/thinker': [
        { key: 'low', label: 'Low' },
        { key: 'high', label: 'High' },
      ],
      'test/writer': [{ key: 'max', label: 'Max' }],
      'test/reasoner': [
        { key: 'low', label: 'Low' },
        { key: 'medium', label: 'Medium' },
        { key: 'high', label: 'High' },
      ],
    });
  });

  it('a custom model with reasoning: true sends the chosen level as reasoning_effort', async () => {
    model.respond({ text: 'Thought it through.' });

    const response = await post({
      prompt: 'Think it through.',
      model: 'test/reasoner',
      reasoning: 'medium',
    });

    expect(response.status).toBe(200);
    expect(choices()).toEqual([['reasoner', 'medium']]);
  });

  it('an SSE request runs every tool-loop step with the reasoning option it sends', async () => {
    model.respond(
      { toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'paint' } }] },
      { text: 'Found it.' },
    );

    const response = await fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Look up paint.', model: 'test/thinker', reasoning: 'high' }),
    });

    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('Found it.');
    expect(lookupCalls).toEqual(['paint']);
    expect(choices()).toEqual([
      ['thinker', 'high'],
      ['thinker', 'high'],
    ]);
  });

  it.each([
    {
      name: 'an unknown key',
      body: { model: 'test/thinker', reasoning: 'forged' },
      error: "Reasoning option 'forged' is not available for model 'test/thinker'",
    },
    {
      name: 'a key offered only by another allowed model',
      body: { model: 'test/thinker', reasoning: 'max' },
      error: "Reasoning option 'max' is not available for model 'test/thinker'",
    },
    {
      name: 'Off for a model that does not accept it',
      body: { model: 'test/thinker', reasoning: 'none' },
      error: "Reasoning option 'none' is not available for model 'test/thinker'",
    },
    {
      name: 'a key for the default model, which has no options',
      body: { reasoning: 'high' },
      error: "Reasoning option 'high' is not available for model 'test/gpt-4.1-mini'",
    },
  ])('$name returns 400 on JSON and SSE without writing or calling the model', async (testCase) => {
    const json = await post({ prompt: 'Start.', ...testCase.body });
    const sse = await post({ prompt: 'Start.', ...testCase.body }, { accept: 'text/event-stream' });

    expect([json.status, sse.status]).toEqual([400, 400]);
    expect([json.body.error, sse.body.error]).toEqual([testCase.error, testCase.error]);
    expect(await rowCounts()).toEqual({ chats: 0, messages: 0 });
    expect(model.requests).toEqual([]);
  });

  it('a forged key on an existing chat adds no message and makes no model call', async () => {
    const { body } = await post({ prompt: 'Start.' });
    const before = await rowCounts();

    model.reset();

    const forged = await post({
      chatId: body.chatId,
      prompt: 'Think harder.',
      model: 'test/writer',
      reasoning: 'high',
    });

    expect(forged.status).toBe(400);
    expect(await rowCounts()).toEqual(before);
    expect(model.requests).toEqual([]);
  });

  it('a model the agent does not allow returns 403 even with a valid key', async () => {
    const response = await post({ prompt: 'Start.', model: 'test/other', reasoning: 'high' });

    expect(response).toEqual({
      status: 403,
      body: { error: "Model 'test/other' is not allowed for agent 'questioner'" },
    });
    expect(await rowCounts()).toEqual({ chats: 0, messages: 0 });
    expect(model.requests).toEqual([]);
  });

  it('a steer to a model without options drops the earlier reasoning option', async () => {
    const hold = deferred();

    model.respond(
      {
        toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'paint' } }],
        hold: hold.promise,
      },
      { text: 'Steered.' },
    );

    const running = post({ prompt: 'Look up paint.', model: 'test/thinker', reasoning: 'high' });

    await vi.waitFor(() => expect(model.requests).toHaveLength(1));

    const [chat] = (
      await booted.frogbot.find({ collection: chatsSlug, depth: 0, overrideAccess: true })
    ).docs;

    const steer = await post({
      chatId: chat!.id,
      prompt: 'Keep it short.',
      model: 'test/gpt-4.1-mini',
      delivery: 'steer',
    });

    hold.resolve();
    await running;

    expect(steer.status).toBe(202);
    expect(choices()).toEqual([
      ['thinker', 'high'],
      ['gpt-4.1-mini', undefined],
    ]);
    expect(model.requests[1]).not.toHaveProperty('reasoning_effort');
  });

  it('a message queued behind a dismissed question runs with its own choice', async () => {
    model.respond({ toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }] });

    const { body } = await post({
      prompt: 'Paint the fence.',
      model: 'test/thinker',
      reasoning: 'high',
    });

    const queued = await post({
      chatId: body.chatId,
      prompt: 'Then write it up.',
      model: 'test/writer',
      reasoning: 'max',
    });

    model.respond({ text: 'Written.' });

    const response = await fetch(
      `${booted.baseUrl}/api/agents/${questionAgentSlug}/chats/${body.chatId}/settle`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolCallId: 'call-question', dismissed: true }),
      },
    );

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect([queued.status, response.status]).toEqual([202, 200]);
    expect(choices()).toEqual([
      ['thinker', 'high'],
      ['writer', 'max'],
    ]);
  });

  it('a queued choice withdrawn before it runs is not replaced and does not block the chat', async () => {
    const hold = deferred();

    model.respond({ text: 'Slow reply.', hold: hold.promise });

    const running = post({ prompt: 'Start.', model: 'test/thinker', reasoning: 'high' });

    await vi.waitFor(() => expect(model.requests).toHaveLength(1));

    const [chat] = (
      await booted.frogbot.find({ collection: chatsSlug, depth: 0, overrideAccess: true })
    ).docs;

    const queued = await post({
      chatId: chat!.id,
      prompt: 'Think a little.',
      model: 'test/thinker',
      reasoning: 'low',
    });

    thinker.reasoningOptions = [{ type: 'effort', values: ['high'] }];

    hold.resolve();
    await running;

    await vi.waitFor(
      async () => {
        const messages = await storedMessages(chat!.id);

        expect(messages.at(-1)).toMatchObject({ role: 'user', status: 'active' });
        await expect(turnState(chat!.id)).resolves.toBe('idle');
      },
      { timeout: 10_000 },
    );

    expect(queued.status).toBe(202);
    expect(choices()).toEqual([['thinker', 'high']]);

    const next = await post({
      chatId: chat!.id,
      prompt: 'Try again.',
      model: 'test/thinker',
      reasoning: 'high',
    });

    expect(next.status).toBe(200);
    expect(choices(1)).toEqual([['thinker', 'high']]);
  });
});
