import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_SCHEDULE_TASK_SLUG } from '../../packages/frogbot/src/agents/resolveScheduleTasks.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import {
  chatsSlug,
  memberName,
  messagesSlug,
  modelPort,
  notesSlug,
  readerAccessCalls,
  readerAgentSlug,
  readerHandlerRuns,
  readerHandlerSlug,
  readerScheduleSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const NOTE = 'Members meet on Friday.';
const CHAT_PROMPT = 'What do the notes say?';
const SCHEDULE_PROMPT = 'Summarise the notes.';

const readNotes = { toolCalls: [{ id: 'call-notes', name: 'read_notes', input: {} }] };

describe('agent runs and overrideAccess', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-run-access');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    await booted.frogbot.create({
      collection: notesSlug,
      data: { text: NOTE },
      overrideAccess: true,
    });
  });

  afterEach(async () => {
    await vi.waitFor(async () => {
      const { docs } = await booted.frogbot.find({
        collection: chatsSlug,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });

      const placeholders = new Set([undefined, null, '', 'Start.', CHAT_PROMPT, SCHEDULE_PROMPT]);

      if (docs.some((doc) => placeholders.has((doc as { title?: string | null }).title))) {
        throw new Error('A chat title is still being generated');
      }
    });

    model.reset();
    readerHandlerRuns.length = 0;
    readerAccessCalls.length = 0;
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
  });

  const toolResult = () => JSON.stringify(model.requests[1]?.messages);

  async function signIn(email: string, name: string) {
    await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-int-password', name },
      overrideAccess: true,
    });

    const response = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'frogbot-int-password' }),
    });

    const { token } = (await response.json()) as { token: string };

    return { Authorization: `JWT ${token}` };
  }

  async function post(path: string, body: unknown, headers: Record<string, string>) {
    const response = await fetch(`${booted.baseUrl}/api/agents/${readerAgentSlug}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      body: (await response.json()) as { status?: string; chatId: number | string },
    };
  }

  async function chat(headers: Record<string, string>) {
    const response = await post('', { prompt: CHAT_PROMPT }, headers);

    expect(response.status).toBe(200);
  }

  async function queuedTurn(headers: Record<string, string>) {
    model.respond({ text: 'Started.' });

    const first = await post('', { prompt: 'Start.' }, headers);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    model.respond({ text: 'Slow reply.', hold }, readNotes, { text: 'Summarised.' });

    const running = post('', { chatId: first.body.chatId, prompt: 'Wait.' }, headers);

    await vi.waitFor(() => expect(model.requests).toHaveLength(2));

    const queued = await post('', { chatId: first.body.chatId, prompt: CHAT_PROMPT }, headers);

    expect(queued.status).toBe(202);

    release();
    await running;
    await vi.waitFor(() => expect(model.requests).toHaveLength(4), { timeout: 10_000 });

    return JSON.stringify(model.requests[3]?.messages);
  }

  async function approvedTurn(headers: Record<string, string>) {
    model.respond({
      toolCalls: [{ id: 'call-approved', name: 'read_notes_approved', input: {} }],
    });

    const paused = await post('', { prompt: CHAT_PROMPT }, headers);

    expect(paused.body.status).toBe('awaiting-input');

    model.respond({ text: 'Summarised.' });

    const settled = await post(
      `/chats/${paused.body.chatId}/settle`,
      { toolCallId: 'call-approved', approved: true },
      headers,
    );

    expect(settled.status).toBe(200);

    return toolResult();
  }

  it('reads members-only notes on a code schedule, which runs trusted', async () => {
    model.respond(readNotes, { text: 'Summarised.' });

    const job = await booted.frogbot.jobs.queue({
      task: AGENT_SCHEDULE_TASK_SLUG,
      input: { agentSlug: readerAgentSlug, triggerSlug: readerScheduleSlug },
      overrideAccess: true,
    });

    await booted.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    expect(toolResult()).toContain(NOTE);
    expect(readerAccessCalls).toEqual([]);
  });

  it("runs a member's chat turn as the member", async () => {
    model.respond(readNotes, { text: 'Summarised.' });

    await chat(await signIn('member-run@frogbot.local', memberName));

    expect(toolResult()).toContain(NOTE);
    expect(readerAccessCalls).toHaveLength(1);
  });

  async function savedSources() {
    let parts: { type: string; title?: string; providerMetadata?: unknown }[] = [];

    await vi.waitFor(async () => {
      const { docs } = await booted.frogbot.find({
        collection: messagesSlug,
        where: { role: { equals: 'assistant' } },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });

      parts = docs.flatMap((doc) => (doc as { parts?: typeof parts }).parts ?? []);

      expect(parts.some((part) => part.type === 'text')).toBe(true);
    });

    return parts.filter((part) => part.type === 'source-document');
  }

  it("saves a member's chat turn sources, looked up as the member", async () => {
    model.respond(readNotes, { text: 'Summarised.' });

    await chat(await signIn('member-sources@frogbot.local', memberName));

    const note = (await booted.frogbot.find({ collection: notesSlug, overrideAccess: true }))
      .docs[0];

    expect(await savedSources()).toEqual([
      expect.objectContaining({
        title: 'Members notes',
        providerMetadata: { frogbot: { collection: notesSlug, id: note.id } },
      }),
    ]);
  });

  it("saves no sources a non-member's chat turn can't read", async () => {
    model.respond(readNotes, { text: 'I could not read them.' });

    await chat(await signIn('guest-sources@frogbot.local', 'Guest'));

    expect(await savedSources()).toEqual([]);
  });

  it("refuses the notes to a non-member's chat turn", async () => {
    model.respond(readNotes, { text: 'I could not read them.' });

    await chat(await signIn('guest-run@frogbot.local', 'Guest'));

    expect(toolResult()).not.toContain(NOTE);
    expect(toolResult()).toContain('You are not allowed to perform this action.');
  });

  it("runs a member's queued turn as the member, checking access once per entry", async () => {
    expect(await queuedTurn(await signIn('member-queue@frogbot.local', memberName))).toContain(
      NOTE,
    );
    expect(readerAccessCalls).toHaveLength(4);
  });

  it("refuses the notes to a non-member's queued turn", async () => {
    const result = await queuedTurn(await signIn('guest-queue@frogbot.local', 'Guest'));

    expect(result).not.toContain(NOTE);
    expect(result).toContain('You are not allowed to perform this action.');
  });

  it("runs a member's approved call as the member when the turn resumes", async () => {
    expect(await approvedTurn(await signIn('member-approve@frogbot.local', memberName))).toContain(
      NOTE,
    );
  });

  it("refuses the notes to a non-member's approved call when the turn resumes", async () => {
    const result = await approvedTurn(await signIn('guest-approve@frogbot.local', 'Guest'));

    expect(result).not.toContain(NOTE);
    expect(result).toContain('You are not allowed to perform this action.');
  });

  it('refuses a schedule handler run without the flag and trusts it with true', async () => {
    model.respond(readNotes, { text: 'Summarised.' });

    const job = await booted.frogbot.jobs.queue({
      task: AGENT_SCHEDULE_TASK_SLUG,
      input: { agentSlug: readerAgentSlug, triggerSlug: readerHandlerSlug },
      overrideAccess: true,
    });

    await booted.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    expect(readerHandlerRuns).toEqual([403, 'ok']);
    expect(toolResult()).toContain(NOTE);
    expect(readerAccessCalls).toEqual([null]);
  });

  it("runs a local generate() as the req's user, and trusted only with the flag", async () => {
    const guest = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'guest-code@frogbot.local', password: 'frogbot-int-password', name: 'Guest' },
      overrideAccess: true,
    });

    const req = () =>
      booted.frogbot.createRequest({ user: { ...guest, collection: usersSlug } } as never);

    const agent = booted.frogbot.agents[readerAgentSlug];

    model.respond(readNotes, { text: 'Summarised.' });
    await agent.generate({ prompt: 'Read.', req: await req() });

    expect(toolResult()).not.toContain(NOTE);
    expect(toolResult()).toContain('You are not allowed to perform this action.');

    model.reset();
    model.respond(readNotes, { text: 'Summarised.' });
    await agent.generate({ prompt: 'Read.', req: await req(), overrideAccess: true });

    expect(toolResult()).toContain(NOTE);
    expect(readerAccessCalls).toEqual([guest.id]);
  });

  it('refuses a local generate() with no user and no flag', async () => {
    await expect(
      booted.frogbot.agents[readerAgentSlug].generate({ prompt: 'Read.' }),
    ).rejects.toMatchObject({ status: 403 });

    expect(model.requests).toEqual([]);
    expect(readerAccessCalls).toEqual([null]);
  });
});
