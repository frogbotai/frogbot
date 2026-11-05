import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UIMessage } from 'frogbot';
import { findTurnState } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAT_ASSETS_SLUG } from '../../packages/frogbot/src/chat/collections/assets.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { StubChatModel, StubChatRequest } from '../__helpers/shared/StubChatModel';
import { defaultSummary, startStubChatModel } from '../__helpers/shared/StubChatModel';
import {
  approvedCalls,
  compactorAgentSlug,
  lookupCalls,
  messagesSlug,
  modelPort,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-int-password';

const OVER = { prompt_tokens: 3_700, completion_tokens: 5 };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

const questionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should I use?',
      options: [{ label: 'Red' }, { label: 'Blue' }],
    },
  ],
};

type TurnJSON = {
  status?: string;
  chatId: number | string;
  text?: string;
  error?: string;
  code?: string;
  message?: UIMessage;
};

type CompactionData = {
  status: string;
  reason: string;
  summary?: string;
  error?: string;
  tokens?: { input: number; output: number };
  keepFrom?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string; text?: string; state?: string; data?: CompactionData }>;
  usage?: { lastStepInputTokens?: number | null } | null;
};

describe('chat compaction', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let headers: Record<string, string>;
  let ownerId: number | string;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-compaction');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    ({ headers, id: ownerId } = await login('owner@frogbot.local'));
  });

  afterEach(() => {
    model.reset();
    lookupCalls.length = 0;
    approvedCalls.length = 0;
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
    await fs.rm(path.resolve(CHAT_ASSETS_SLUG), { recursive: true, force: true });
  });

  async function login(email: string) {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const response = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const { token } = (await response.json()) as { token: string };

    return { headers: { Authorization: `JWT ${token}` }, id: user.id as number | string };
  }

  async function post(route: string, body: unknown, extra: Record<string, string> = headers) {
    const response = await fetch(`${booted.baseUrl}/api${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as TurnJSON };
  }

  function turn(prompt: string, chatId?: number | string) {
    return post(`/agents/${compactorAgentSlug}`, { prompt, ...(chatId ? { chatId } : {}) });
  }

  async function uploadPdf() {
    const body = new FormData();
    const data = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(1_000, 0x20),
      Buffer.from('\nxref\n%%EOF\n'),
    ]);

    body.set('_payload', '{}');
    body.set('file', new Blob([new Uint8Array(data)], { type: 'application/pdf' }), 'invoice.pdf');

    const response = await fetch(`${booted.baseUrl}/api/${CHAT_ASSETS_SLUG}`, {
      method: 'POST',
      headers,
      body,
    });

    return ((await response.json()) as { doc: { id: number | string; filename: string } }).doc;
  }

  function settle(chatId: number | string, body: unknown) {
    return post(`/agents/${compactorAgentSlug}/chats/${chatId}/settle`, body);
  }

  function compactNow(chatId: number | string, extra?: Record<string, string>) {
    return post('/frogbot/chat/compact', { chatId }, extra);
  }

  async function stored(chatId: number | string): Promise<StoredMessage[]> {
    const { docs } = await booted.frogbot.find({
      collection: messagesSlug,
      where: { chat: { equals: chatId } },
      sort: ['createdAt', 'id'],
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    return docs as unknown as StoredMessage[];
  }

  function compactionParts(messages: StoredMessage[]) {
    return messages.flatMap(({ parts }) =>
      parts.filter(({ type }) => type === 'data-compaction').map(({ data }) => data!),
    );
  }

  function sent(request: StubChatRequest | undefined) {
    return JSON.stringify(request?.messages ?? []);
  }

  function opening(request: StubChatRequest | undefined) {
    return JSON.stringify(request?.messages.find(({ role }) => role !== 'system')?.content ?? '');
  }

  function expectPairedToolCalls(request: StubChatRequest | undefined) {
    const messages = (request?.messages ?? []) as Array<{
      role: string;
      tool_calls?: Array<{ id: string }>;
      tool_call_id?: string;
    }>;

    messages.forEach((message, index) => {
      const ids = (message.tool_calls ?? []).map(({ id }) => id);
      const results = messages
        .slice(index + 1, index + 1 + ids.length)
        .map(({ tool_call_id }) => tool_call_id);

      expect(results).toEqual(ids);

      if (message.role === 'tool') {
        expect(
          messages
            .slice(0, index)
            .some(({ tool_calls }) => tool_calls?.some(({ id }) => id === message.tool_call_id)),
        ).toBe(true);
      }
    });
  }

  async function longChat() {
    model.respond({ text: 'Frogs sing to attract mates.', usage: OVER });

    const first = await turn('Why do frogs sing?');

    expect(first.status).toBe(200);

    return first.body.chatId;
  }

  describe('auto', () => {
    it('stores a completed part and starts this turn and the next from the checkpoint', async () => {
      const chatId = await longChat();

      model.respond({ text: 'At night, mostly.' }, { text: 'Spring.' });

      const second = await turn('When do they sing?', chatId);
      const afterSecond = await stored(chatId);
      const [part] = compactionParts(afterSecond);

      expect(second.status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
      expect(sent(model.summaryRequests[0])).toContain('Why do frogs sing?');
      expect(part).toMatchObject({
        status: 'completed',
        reason: 'auto',
        summary: expect.stringContaining('## Objective'),
        tokens: { input: 3, output: 2 },
        keepFrom: afterSecond[2].id,
      });
      expect(afterSecond[3].parts.map(({ type }) => type)).toEqual([
        'data-compaction',
        'step-start',
        'text',
      ]);

      expect(opening(model.requests[1])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[1])).not.toContain('Why do frogs sing?');
      expect(sent(model.requests[1])).toContain('When do they sing?');

      await turn('And when in the year?', chatId);

      expect(model.summaryRequests).toHaveLength(1);
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[2])).toContain('At night, mostly.');
      expect(sent(model.requests[2])).not.toContain('Frogs sing to attract mates.');
    });

    it('keeps a PDF in the kept messages whole on this turn and the next', async () => {
      const chatId = await longChat();
      const invoice = await uploadPdf();

      model.respond({ text: 'It is due Friday.' }, { text: 'Paid.' });

      const second = await post(`/agents/${compactorAgentSlug}`, {
        chatId,
        messages: [
          {
            id: 'user-invoice',
            role: 'user',
            parts: [
              { type: 'text', text: 'When is this due?' },
              {
                type: 'file-reference',
                id: invoice.id,
                filename: invoice.filename,
                mediaType: 'application/pdf',
              },
            ],
          },
        ],
      });

      expect(second.status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
      expect(opening(model.requests[1])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[1])).toContain(invoice.filename);

      await turn('Is it paid?', chatId);

      expect(model.summaryRequests).toHaveLength(1);
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[2])).toContain(invoice.filename);
      expect(sent(model.requests[2])).toContain('"type":"file"');
    });

    it('leaves the stored messages and branches whole', async () => {
      const chatId = await longChat();

      await turn('When do they sing?', chatId);

      const messages = await stored(chatId);

      expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant', 'user', 'assistant']);

      const list = await fetch(
        `${booted.baseUrl}/api/${messagesSlug}?where[chat][equals]=${chatId}&sort=createdAt`,
        { headers },
      );

      expect(((await list.json()) as { docs: unknown[] }).docs).toHaveLength(4);

      const branch = await post('/frogbot/chat/branch', {
        chatId,
        messageId: messages.at(-1)!.id,
      });

      expect(branch.status).toBe(200);
      expect(await stored(branch.body.chatId)).toHaveLength(4);
    });

    it('compacts agent.generate with a chatId the same way', async () => {
      const chatId = await longChat();
      const req = await booted.frogbot.createRequest({
        user: { id: ownerId, collection: usersSlug } as never,
      });

      await booted.frogbot.agents[compactorAgentSlug].generate({
        prompt: 'When do they sing?',
        chatId,
        req,
      });

      expect(model.summaryRequests).toHaveLength(1);
      expect(opening(model.requests[1])).toContain('<conversation-checkpoint>');
      expect(compactionParts(await stored(chatId))).toEqual([
        expect.objectContaining({ status: 'completed', reason: 'auto' }),
      ]);
    });

    it('saves a failed part and ends the turn when the summary fails, then retries next turn', async () => {
      const chatId = await longChat();

      model.respondSummary({ text: 'Frogs.' }, { text: 'Still frogs.' });

      const failed = await turn('When do they sing?', chatId);

      expect(failed.status).toBe(502);
      expect(failed.body.error).toBe('The model did not fill in the summary template.');
      expect(model.requests).toHaveLength(1);
      expect(compactionParts(await stored(chatId))).toEqual([
        expect.objectContaining({
          status: 'failed',
          error: 'The model did not fill in the summary template.',
        }),
      ]);

      model.respond({ text: 'At night.' });

      const retried = await turn('When do they sing?', chatId);

      expect(retried.status).toBe(200);
      expect(model.summaryRequests).toHaveLength(3);
      expect(opening(model.requests[1])).toContain('<conversation-checkpoint>');
    });

    it('compacts once and retries the step after one "too long" rejection', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;
      const tooLong = {
        error: {
          status: 400,
          body: { error: { code: 'context_length_exceeded', message: 'Too long.' } },
        },
      };

      model.respond(tooLong, { text: 'At night.' });

      const retried = await turn('When do they sing?', chatId);

      expect(retried.status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
      expect(model.requests).toHaveLength(3);
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');

      model.respond(tooLong, tooLong);

      const failed = await turn('And in winter?', chatId);

      expect(failed.status).toBe(502);
      expect(failed.body.error).toBe('This chat is too long for test/small-window.');
      expect(model.summaryRequests).toHaveLength(2);
    });

    it('puts a mid-turn part between steps and streams running before completed', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      model.respond(
        {
          toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'frogs' } }],
          usage: OVER,
        },
        { text: 'Found it.' },
      );

      const response = await fetch(`${booted.baseUrl}/api/agents/${compactorAgentSlug}`, {
        method: 'POST',
        headers: { accept: 'text/event-stream', 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ prompt: 'Look frogs up.', chatId }),
      });

      const events = await response.text();
      const reply = (await stored(chatId)).at(-1)!;

      expect(events.indexOf('"status":"running"')).toBeGreaterThan(-1);
      expect(events.indexOf('"status":"running"')).toBeLessThan(
        events.indexOf('"status":"completed"'),
      );
      expect(reply.parts.map(({ type }) => type)).toEqual([
        'step-start',
        'tool-lookup',
        'data-compaction',
        'step-start',
        'text',
      ]);
      expect(sent(model.requests[2])).toContain('Found frogs.');
      expect(sent(model.requests[2])).not.toContain('Frogs sing to attract mates.');
    });

    it('compacts when a question is answered over the ceiling and keeps the paused reply whole', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      model.respond({
        toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }],
        usage: OVER,
      });

      expect((await turn('Paint the pond.', chatId)).body.status).toBe('awaiting-input');

      model.respond({ text: 'Blue it is.' });

      const answered = await settle(chatId, {
        toolCallId: 'call-question',
        output: { answers: [{ header: 'Color', selected: ['Blue'] }] },
      });

      expect(answered.status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
      expect(sent(model.summaryRequests[0])).not.toContain('call-question');
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[2])).toContain('call-question');
      expect(sent(model.requests[2])).toContain('Blue');
    });

    it.each([
      ['approved', true, 'Closed T-1.'],
      ['denied', false, 'Keep it open.'],
    ])(
      'resumes a %s tool approval over the ceiling with the call after the checkpoint',
      async (_, approved, result) => {
        model.respond({ text: 'Frogs sing to attract mates.' });

        const { chatId } = (await turn('Why do frogs sing?')).body;

        model.respond({
          toolCalls: [{ id: 'call-close', name: 'close_ticket', input: { ticket: 'T-1' } }],
          usage: OVER,
        });

        expect((await turn('Close T-1.', chatId)).body.status).toBe('awaiting-input');

        model.respond({ text: 'Done.' });

        const answered = await settle(chatId, {
          toolCallId: 'call-close',
          approved,
          ...(approved ? {} : { reason: 'Keep it open.' }),
        });

        expect(answered.status).toBe(200);
        expect(approvedCalls).toHaveLength(approved ? 1 : 0);
        expect(model.summaryRequests).toHaveLength(1);
        expect(sent(model.summaryRequests[0])).not.toContain('call-close');
        expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
        expect(sent(model.requests[2])).toContain('call-close');
        expect(sent(model.requests[2]).toLowerCase()).toContain(result.toLowerCase());
      },
    );

    it('sends older tool calls and results to the summary as text', async () => {
      model.respond(
        { toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'frogs' } }] },
        { text: 'Frogs sing to attract mates.', usage: OVER },
      );

      const { chatId } = (await turn('Look frogs up.')).body;

      model.respond({ text: 'At night.' });

      expect((await turn('When do they sing?', chatId)).status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);

      const summary = model.summaryRequests[0].messages as Array<{
        role: string;
        tool_calls?: unknown;
      }>;

      expect(summary.some(({ role, tool_calls }) => role === 'tool' || tool_calls)).toBe(false);
      expect(sent(model.summaryRequests[0])).toContain(
        '[Tool call lookup: {\\"topic\\":\\"frogs\\"}]',
      );
      expect(sent(model.summaryRequests[0])).toContain('[Tool result lookup: Found frogs.]');
    });

    it('resumes a tool approved at step 2 over the ceiling with both steps after the checkpoint', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      model.respond(
        { toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'T-1' } }] },
        {
          toolCalls: [{ id: 'call-close', name: 'close_ticket', input: { ticket: 'T-1' } }],
          usage: OVER,
        },
      );

      expect((await turn('Look T-1 up, then close it.', chatId)).body.status).toBe(
        'awaiting-input',
      );
      expect(model.summaryRequests).toHaveLength(0);

      model.respond({ text: 'Done.' });

      expect((await settle(chatId, { toolCallId: 'call-close', approved: true })).status).toBe(200);
      expect(approvedCalls).toHaveLength(1);
      expect(model.summaryRequests).toHaveLength(1);
      expect(sent(model.summaryRequests[0])).toContain('Why do frogs sing?');
      expect(sent(model.summaryRequests[0])).not.toContain('call-lookup');

      const resumed = model.requests[3];

      expect(opening(resumed)).toContain('<conversation-checkpoint>');
      expect(sent(resumed)).not.toContain('Frogs sing to attract mates.');
      expect(sent(resumed)).toContain('Found T-1.');
      expect(sent(resumed)).toContain('Closed T-1.');

      expectPairedToolCalls(resumed);
    });

    it('resumes an approval after a mid-turn compaction without compacting again', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      model.respond(
        {
          toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'T-1' } }],
          usage: OVER,
        },
        { toolCalls: [{ id: 'call-close', name: 'close_ticket', input: { ticket: 'T-1' } }] },
      );

      expect((await turn('Look T-1 up, then close it.', chatId)).body.status).toBe(
        'awaiting-input',
      );
      expect(model.summaryRequests).toHaveLength(1);

      model.respond({ text: 'Done.' });

      expect((await settle(chatId, { toolCallId: 'call-close', approved: true })).status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);

      const resumed = model.requests[3];

      expect(opening(resumed)).toContain('<conversation-checkpoint>');
      expect(sent(resumed)).not.toContain('Frogs sing to attract mates.');
      expect(sent(resumed)).toContain('Found T-1.');
      expect(sent(resumed)).toContain('Closed T-1.');

      expectPairedToolCalls(resumed);
    });

    it('a steer sent while the summary runs joins the next step after the checkpoint', async () => {
      const chatId = await longChat();
      const hold = deferred();

      model.respondSummary({ text: defaultSummary, hold: hold.promise });

      model.respond(
        { toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'frogs' } }] },
        { text: 'Oil it is.' },
      );

      const running = turn('Look frogs up.', chatId);

      await vi.waitFor(() => expect(model.summaryRequests).toHaveLength(1));

      const steer = await post(`/agents/${compactorAgentSlug}`, {
        chatId,
        prompt: 'Use oil paint.',
        delivery: 'steer',
      });

      expect(steer.status).toBe(202);

      hold.resolve();

      expect((await running).status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
      expect(sent(model.summaryRequests[0])).not.toContain('Use oil paint.');
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[2])).toContain('Use oil paint.');
      expect(sent(model.requests[2])).toContain('Found frogs.');

      expectPairedToolCalls(model.requests[2]);
    });

    it('a steer promoted at the compacting step stays out of the summary', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;
      const hold = deferred();

      model.respond(
        {
          toolCalls: [{ id: 'call-lookup', name: 'lookup', input: { topic: 'frogs' } }],
          usage: OVER,
          hold: hold.promise,
        },
        { text: 'Oil it is.' },
      );

      const running = turn('Look frogs up.', chatId);

      await vi.waitFor(() => expect(model.requests).toHaveLength(2));

      expect(
        (
          await post(`/agents/${compactorAgentSlug}`, {
            chatId,
            prompt: 'Use oil paint.',
            delivery: 'steer',
          })
        ).status,
      ).toBe(202);

      hold.resolve();

      expect((await running).status).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
      expect(sent(model.summaryRequests[0])).not.toContain('Use oil paint.');
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[2])).toContain('Use oil paint.');
      expect(sent(model.requests[2])).toContain('Found frogs.');

      expectPairedToolCalls(model.requests[2]);
    });

    it('a message queued behind a compacting turn runs from the checkpoint', async () => {
      const chatId = await longChat();
      const hold = deferred();

      model.respond({ text: 'At night.', hold: hold.promise }, { text: 'In spring.' });

      const running = turn('When do they sing?', chatId);

      await vi.waitFor(() => expect(model.requests).toHaveLength(2));

      const queued = await turn('And in the year?', chatId);

      expect(queued.status).toBe(202);

      hold.resolve();
      await running;
      await vi.waitFor(() => expect(model.requests).toHaveLength(3), { timeout: 10_000 });

      expect(model.summaryRequests).toHaveLength(1);
      expect(opening(model.requests[2])).toContain('<conversation-checkpoint>');
      expect(sent(model.requests[2])).toContain('And in the year?');
      expect(sent(model.requests[2])).not.toContain('Frogs sing to attract mates.');
    });

    it('passes an error that is not an overflow straight through', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      model.respond({
        error: { status: 400, body: { error: { code: 'invalid_request', message: 'Bad input.' } } },
      });

      const failed = await turn('When do they sing?', chatId);

      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(failed.body.error).not.toBe('This chat is too long for test/small-window.');
      expect(model.requests).toHaveLength(2);
      expect(model.summaryRequests).toHaveLength(0);
    });

    it('never compacts agent.generate without a chatId, even on a "too long" rejection', async () => {
      const req = await booted.frogbot.createRequest({
        user: { id: ownerId, collection: usersSlug } as never,
      });

      model.respond({
        error: {
          status: 400,
          body: { error: { code: 'context_length_exceeded', message: 'Too long.' } },
        },
      });

      await expect(
        booted.frogbot.agents[compactorAgentSlug].generate({ prompt: 'Why?', req }),
      ).rejects.toThrow();
      expect(model.requests).toHaveLength(1);
      expect(model.summaryRequests).toHaveLength(0);
    });
  });

  describe('manual', () => {
    async function twoExchanges() {
      model.respond({ text: 'Frogs sing to attract mates.' }, { text: 'At night.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      await turn('When do they sing?', chatId);

      return chatId;
    }

    it('writes a manual compaction that the next turn starts from', async () => {
      const chatId = await twoExchanges();
      const response = await compactNow(chatId);
      const messages = await stored(chatId);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatchObject({
        role: 'assistant',
        parts: [
          {
            type: 'data-compaction',
            data: { status: 'completed', reason: 'manual', keepFrom: messages[2].id },
          },
        ],
      });
      expect(messages.at(-1)!.id).toBe(response.body.message!.id);

      model.respond({ text: 'In spring.' });

      await turn('And in the year?', chatId);

      expect(opening(model.requests.at(-1))).toContain('<conversation-checkpoint>');
      expect(sent(model.requests.at(-1))).toContain('At night.');
      expect(sent(model.requests.at(-1))).not.toContain('Frogs sing to attract mates.');
    });

    it('does not compact again on the turn right after /compact', async () => {
      const near = { prompt_tokens: 3_595, completion_tokens: 5 };

      model.respond({ text: 'Frogs sing to attract mates.' }, { text: 'At night.', usage: near });

      const { chatId } = (await turn('Why do frogs sing?')).body;

      await turn('When do they sing?', chatId);

      expect(model.summaryRequests).toHaveLength(0);
      expect((await compactNow(chatId)).status).toBe(200);

      model.respond({ text: 'In spring.' });

      expect(
        (await turn('And in which season exactly, and for how many weeks each year?', chatId))
          .status,
      ).toBe(200);
      expect(model.summaryRequests).toHaveLength(1);
    });

    it('refuses while a question waits, writes nothing, and the question can still be answered', async () => {
      const chatId = await twoExchanges();

      model.respond({
        toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }],
      });

      await turn('Paint the pond.', chatId);

      const before = await stored(chatId);
      const refused = await compactNow(chatId);

      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('turn-in-progress');
      expect(await stored(chatId)).toEqual(before);

      const answered = await settle(chatId, {
        toolCallId: 'call-question',
        output: { answers: [{ header: 'Color', selected: ['Blue'] }] },
      });

      expect(answered.status).toBe(200);
    });

    it('refuses while a tool approval waits', async () => {
      const chatId = await twoExchanges();

      model.respond({
        toolCalls: [{ id: 'call-close', name: 'close_ticket', input: { ticket: 'T-1' } }],
      });

      await turn('Close T-1.', chatId);

      const refused = await compactNow(chatId);

      expect(refused.body.code).toBe('turn-in-progress');
      expect((await settle(chatId, { toolCallId: 'call-close', approved: true })).status).toBe(200);
      expect(approvedCalls).toHaveLength(1);
    });

    it('refuses while a reply runs', async () => {
      const chatId = await twoExchanges();
      let release!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });

      model.respond({ text: 'Later.', hold });

      const running = turn('Wait for it.', chatId);

      await expect
        .poll(async () => findTurnState({ req: await booted.frogbot.createRequest({}), chatId }))
        .toBe('running');

      const refused = await compactNow(chatId);

      release();
      await running;

      expect(refused.body.code).toBe('turn-in-progress');
    });

    it('writes nothing when there is nothing to compact', async () => {
      model.respond({ text: 'Frogs sing to attract mates.' });

      const { chatId } = (await turn('Why do frogs sing?')).body;
      const refused = await compactNow(chatId);

      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('nothing-to-compact');
      expect(await stored(chatId)).toHaveLength(2);
      expect(model.summaryRequests).toHaveLength(0);
    });

    it("refuses a signed-out caller and another user's chat", async () => {
      const chatId = await twoExchanges();
      const stranger = await login('stranger@frogbot.local');

      expect((await compactNow(chatId, {})).status).toBe(401);
      expect((await compactNow(chatId, stranger.headers)).status).toBe(404);
      expect(await stored(chatId)).toHaveLength(4);
    });
  });
});
