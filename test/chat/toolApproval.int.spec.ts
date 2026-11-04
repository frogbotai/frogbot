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
  approvedCalls,
  approverAgentSlug,
  chatsSlug,
  messagesSlug,
  modelPort,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const NOT_APPROVABLE =
  "Not run: this tool needs a person's approval, and nobody can approve it in this run.";

type AgentJSON = {
  status: string;
  chatId: number | string;
  text?: string;
  code?: string;
  pending?: Array<{ toolCallId: string; toolName: string; approval?: { reason?: string } }>;
  settlement?: { status: string; allSettled: boolean; part: { state: string } };
};

type StoredPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  approval?: { approved?: boolean; reason?: string; requestReason?: string };
};

type StoredMessage = {
  id: string;
  role: string;
  parts: StoredPart[];
  settlements?: Record<string, { outcome: string }>;
};

const close = (id = 'call-close', ticket = 'T-1') => ({
  id,
  name: 'close_ticket',
  input: { ticket },
});

describe('chat tool approval', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-tool-approval');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(() => {
    model.reset();
    approvedCalls.length = 0;
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

  function start(body: Record<string, unknown> = {}) {
    return post(`/agents/${approverAgentSlug}`, { prompt: 'Close T-1.', ...body });
  }

  function settle(chatId: number | string, body: unknown, headers?: Record<string, string>) {
    return post(`/agents/${approverAgentSlug}/chats/${chatId}/settle`, body, headers);
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

    return result.docs;
  }

  async function turnState(chatId: number | string) {
    return findTurnState({ req: await booted.frogbot.createRequest({}), chatId });
  }

  async function titled(chatId: number | string) {
    await vi.waitFor(async () => {
      const chat = await booted.frogbot.findByID({
        collection: chatsSlug,
        id: chatId,
        depth: 0,
        overrideAccess: true,
      });

      if (!chat.title || chat.title === placeholderChatTitle(await storedMessages(chatId))) {
        throw new Error('The chat title is still being generated');
      }
    });
  }

  function toolPart(message: StoredMessage, toolCallId: string) {
    return message.parts.find((part) => part.toolCallId === toolCallId);
  }

  it('pauses an ask tool and runs the stored input once approved', async () => {
    model.respond({ toolCalls: [close()] });

    const paused = await start();

    expect(paused.body.status).toBe('awaiting-input');
    expect(paused.body.pending).toEqual([
      expect.objectContaining({ toolCallId: 'call-close', toolName: 'close_ticket', approval: {} }),
    ]);
    expect(approvedCalls).toEqual([]);
    await expect(turnState(paused.body.chatId)).resolves.toBe('awaiting');

    model.respond({ text: 'Closed it.' });

    const response = await settle(paused.body.chatId, {
      toolCallId: 'call-close',
      approved: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'completed', text: 'Closed it.' });
    expect(approvedCalls).toEqual([{ tool: 'close_ticket', input: { ticket: 'T-1' } }]);

    const [, assistant] = await storedMessages(paused.body.chatId);

    expect(toolPart(assistant, 'call-close')).toMatchObject({
      state: 'output-available',
      output: 'Closed T-1.',
      approval: { approved: true },
    });
    expect(assistant.settlements?.['call-close']).toMatchObject({ outcome: 'approved' });
  });

  it('shows the rule reason, and lets the model read a denial reason and go on', async () => {
    model.respond({
      toolCalls: [{ id: 'call-delete', name: 'delete_ticket', input: { ticket: 'T-2' } }],
    });

    const paused = await start();

    expect(paused.body.pending).toEqual([
      expect.objectContaining({ approval: { reason: 'Deleting cannot be undone.' } }),
    ]);

    model.respond({ text: 'Left it open.' });

    const response = await settle(paused.body.chatId, {
      toolCallId: 'call-delete',
      approved: false,
      reason: 'Keep it for the audit.',
    });

    expect(response.body).toMatchObject({ status: 'completed', text: 'Left it open.' });
    expect(approvedCalls).toEqual([]);
    expect(JSON.stringify(model.requests.at(-1)!.messages)).toContain('Keep it for the audit.');

    const [, assistant] = await storedMessages(paused.body.chatId);

    expect(toolPart(assistant, 'call-delete')).toMatchObject({
      state: 'output-denied',
      approval: { approved: false, reason: 'Keep it for the audit.' },
    });
    expect(assistant.settlements?.['call-delete']).toMatchObject({ outcome: 'denied' });
  });

  it('stops the turn on a denial without a reason', async () => {
    model.respond({ toolCalls: [close()] });

    const paused = await start();
    const response = await settle(paused.body.chatId, {
      toolCallId: 'call-close',
      approved: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'denied' });
    expect(model.requests).toHaveLength(1);
    expect(approvedCalls).toEqual([]);
    await expect(turnState(paused.body.chatId)).resolves.toBe('idle');

    const [, assistant] = await storedMessages(paused.body.chatId);

    expect(toolPart(assistant, 'call-close')).toMatchObject({ state: 'output-denied' });
  });

  it('refuses a second answer as already settled', async () => {
    model.respond({ toolCalls: [close()] }, { text: 'Closed.' });

    const paused = await start();

    await settle(paused.body.chatId, { toolCallId: 'call-close', approved: true });

    const requests = model.requests.length;
    const again = await settle(paused.body.chatId, { toolCallId: 'call-close', approved: false });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already-settled');
    expect(model.requests).toHaveLength(requests);
    expect(approvedCalls).toHaveLength(1);
  });

  it('refuses an output for an approval and an approval for a question', async () => {
    model.respond({
      toolCalls: [
        close(),
        {
          id: 'call-question',
          name: 'question',
          input: { questions: [{ header: 'Why', question: 'Why?', options: [{ label: 'A' }] }] },
        },
      ],
    });

    const paused = await start();

    const output = await settle(paused.body.chatId, { toolCallId: 'call-close', output: 'ok' });
    const approval = await settle(paused.body.chatId, {
      toolCallId: 'call-question',
      approved: true,
    });

    expect([output.status, output.body.code]).toEqual([400, 'invalid-output']);
    expect([approval.status, approval.body.code]).toEqual([400, 'invalid-output']);
    await expect(turnState(paused.body.chatId)).resolves.toBe('awaiting');
  });

  it('a resume runs the stored input, not the input the client sends back', async () => {
    model.respond({ toolCalls: [close()] });

    const paused = await start();
    const [, assistant] = await storedMessages(paused.body.chatId);

    model.respond({ text: 'Done.' });

    const resume = (parts: StoredPart[]) =>
      fetch(`${booted.baseUrl}/api/agents/${approverAgentSlug}`, {
        method: 'POST',
        headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: paused.body.chatId, messages: [{ ...assistant, parts }] }),
      });

    const tampered = assistant.parts.map((part) =>
      part.toolCallId === 'call-close'
        ? {
            ...part,
            state: 'approval-responded',
            input: { ticket: 'T-999' },
            approval: { ...part.approval, approved: true },
          }
        : part,
    );

    const response = await resume(tampered);

    expect(response.status).toBe(200);

    await response.text();

    expect(approvedCalls).toEqual([{ tool: 'close_ticket', input: { ticket: 'T-1' } }]);

    const again = await resume(tampered);

    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({ code: 'already-settled' });
    expect(approvedCalls).toHaveLength(1);
  });

  it('a resume can not deny without a reason', async () => {
    model.respond({ toolCalls: [close()] });

    const paused = await start();
    const [, assistant] = await storedMessages(paused.body.chatId);

    const response = await fetch(`${booted.baseUrl}/api/agents/${approverAgentSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: paused.body.chatId,
        messages: [
          {
            ...assistant,
            parts: assistant.parts.map((part) =>
              part.toolCallId === 'call-close'
                ? {
                    ...part,
                    state: 'approval-responded',
                    approval: { ...part.approval, approved: false },
                  }
                : part,
            ),
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(turnState(paused.body.chatId)).resolves.toBe('awaiting');
  });

  it('refuses an answer from someone who can read the chat but not continue it', async () => {
    const reader = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'reader-approval@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    });

    const login = await post(`/${usersSlug}/login`, {
      email: 'reader-approval@frogbot.local',
      password: 'frogbot-int-password',
    });

    const headers = { Authorization: `JWT ${(login.body as unknown as { token: string }).token}` };

    model.respond({ toolCalls: [close()] });

    const paused = await start();

    await titled(paused.body.chatId);

    await booted.frogbot.update({
      collection: chatsSlug,
      id: paused.body.chatId,
      data: { sharedWith: [reader.id] },
      overrideAccess: true,
    });

    const response = await settle(
      paused.body.chatId,
      { toolCallId: 'call-close', approved: true },
      headers,
    );

    expect(response.status).toBe(404);
    expect(approvedCalls).toEqual([]);
    await expect(turnState(paused.body.chatId)).resolves.toBe('awaiting');
  });

  it("with the chat's autoApprove on, an ask tool runs and a required tool still pauses", async () => {
    model.respond({ text: 'Hello.' });

    const first = await start({ prompt: 'Hi.' });

    await titled(first.body.chatId);

    await booted.frogbot.update({
      collection: chatsSlug,
      id: first.body.chatId,
      data: { autoApprove: true },
      overrideAccess: true,
    });

    model.respond({
      toolCalls: [close(), { id: 'call-delete', name: 'delete_ticket', input: { ticket: 'T-2' } }],
    });

    const paused = await start({ chatId: first.body.chatId });

    expect(approvedCalls).toEqual([{ tool: 'close_ticket', input: { ticket: 'T-1' } }]);
    expect(paused.body.pending?.map(({ toolCallId }) => toolCallId)).toEqual(['call-delete']);
  });

  it('a new chat started with autoApprove stores it and runs an ask tool', async () => {
    model.respond({ toolCalls: [close()] }, { text: 'Closed.' });

    const response = await start({ autoApprove: true });

    expect(response.body.status).toBe('completed');
    expect(approvedCalls).toEqual([{ tool: 'close_ticket', input: { ticket: 'T-1' } }]);
    await expect(
      booted.frogbot.findByID({
        collection: chatsSlug,
        id: response.body.chatId,
        depth: 0,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ autoApprove: true });
  });

  it('generate() has nobody to ask, so it denies with feedback and finishes', async () => {
    model.respond({ toolCalls: [close()] }, { text: 'I could not close it.' });

    const result = await booted.frogbot.agents[approverAgentSlug].generate({ prompt: 'Go.' });

    expect(result.text).toBe('I could not close it.');
    expect(approvedCalls).toEqual([]);
    expect(JSON.stringify(model.requests[1].messages)).toContain(NOT_APPROVABLE);
  });
});
