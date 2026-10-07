import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UIMessage } from 'ai';
import type { Tool } from 'frogbot';
import { findTurnState } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  CHAT_ASSETS_SLUG,
  SKIP_ASSET_TEXT_CONTEXT_KEY,
} from '../../packages/frogbot/src/chat/collections/assets.js';
import { placeholderChatTitle } from '../../packages/frogbot/src/chat/title.js';
import { createFrogBotSDK } from '../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import {
  budgetText,
  budgetXlsx,
  encryptedOfficeFile,
  reportDocx,
  reportText,
  xlsxFile,
} from '../__helpers/shared/office.js';
import type { StubChatModel, StubChatRequest } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import {
  chatsSlug,
  messagesSlug,
  modelPort,
  questionAgentSlug,
  turnsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-int-password';

const MiB = 1024 * 1024;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const ZIP = Buffer.concat([Buffer.from('PK\x05\x06', 'latin1'), Buffer.alloc(18)]);

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const questionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should I use?',
      options: [{ label: 'Red' }, { label: 'Blue' }],
    },
  ],
};

const noopInput = z.object({});

const noop: Tool = {
  slug: 'noop',
  description: 'Do nothing.',
  inputSchema: noopInput,
  execute: () => 'ok',
};

const imageMarker = "[Can't read photo.png: this model doesn't accept images]";

type Asset = { id: number | string; filename: string; mimeType: string };

type StoredAsset = Asset & {
  chat?: number | string | null;
  owner?: number | string | null;
  text?: string | null;
};

type Part = Record<string, unknown>;

type AgentJSON = { status?: string; chatId: number | string; error?: string };

type StoredMessage = { id: string; role: string; parts: Part[] };

type SentPart = {
  type: string;
  text?: string;
  file?: { filename?: string };
};

function padded({ head, size, fill = 0 }: { head: Buffer; size: number; fill?: number }) {
  return Buffer.concat([head, Buffer.alloc(size - head.length, fill)]);
}

function pdf(size: number): Buffer {
  const head = Buffer.from('%PDF-1.4\n');
  const tail = Buffer.from('\nxref\n%%EOF\n');

  return Buffer.concat([head, Buffer.alloc(size - head.length - tail.length, 0x20), tail]);
}

function summary(part: SentPart): string {
  if (part.type === 'text') return part.text!;

  if (part.type === 'image_url') return 'image';

  if (part.type === 'file') return `pdf ${part.file?.filename}`;

  return part.type;
}

function userContent(request: StubChatRequest): string[][] {
  return request.messages
    .filter(({ role }) => role === 'user')
    .map(({ content }) =>
      typeof content === 'string' ? [content] : (content as SentPart[]).map(summary),
    );
}

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('chat attachments reach the agent model', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let user: Awaited<ReturnType<typeof signIn>>['user'];
  let token: string;
  let sequence = 0;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-attachments');
  });

  beforeEach(async () => {
    for (const collection of [turnsSlug, messagesSlug] as const) {
      await booted.frogbot.delete({ collection, where: {}, overrideAccess: true });
    }

    await clearAndSeed(booted.frogbot, 'empty');

    ({ user, token } = await signIn());
  });

  async function signIn() {
    const email = `owner-${++sequence}@frogbot.local`;

    const created = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const login = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    return { user: created, token: ((await login.json()) as { token: string }).token };
  }

  afterEach(async () => {
    model.reset();

    await vi.waitFor(async () => {
      const chats = await booted.frogbot.find({
        collection: chatsSlug,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });

      const naming = await Promise.all(
        chats.docs.map(async ({ id, title }) => {
          const messages = await storedMessages(id);

          if (!messages.some(({ role }) => role === 'assistant')) return false;

          return !title || title === placeholderChatTitle(messages);
        }),
      );

      if (naming.some(Boolean)) throw new Error('Chat titles are still being generated');
    });
  });

  afterAll(async () => {
    await booted.shutdown();
    await model.close();
    await fs.rm(path.resolve(CHAT_ASSETS_SLUG), { recursive: true, force: true });
  });

  async function upload({
    name,
    type,
    data,
  }: {
    name: string;
    type: string;
    data: Buffer | string;
  }): Promise<Asset> {
    const body = new FormData();

    body.set('_payload', '{}');
    body.set('file', new Blob([data], { type }), name);

    const response = await fetch(`${booted.baseUrl}/api/${CHAT_ASSETS_SLUG}`, {
      method: 'POST',
      headers: { authorization: `JWT ${token}` },
      body,
    });

    if (!response.ok) throw new Error(`Upload failed: ${await response.text()}`);

    return ((await response.json()) as { doc: Asset }).doc;
  }

  function reportUpload(): Promise<Asset> {
    return upload({ name: 'report.docx', type: DOCX_TYPE, data: Buffer.from(reportDocx()) });
  }

  function budgetUpload(): Promise<Asset> {
    return upload({ name: 'budget.xlsx', type: XLSX_TYPE, data: Buffer.from(budgetXlsx()) });
  }

  async function withoutText(asset: Asset): Promise<Asset> {
    await booted.frogbot.db.updateOne({
      collection: CHAT_ASSETS_SLUG,
      id: asset.id,
      data: { text: null },
    });

    return asset;
  }

  async function storedAsset(asset: Asset): Promise<StoredAsset> {
    return (await booted.frogbot.findByID({
      collection: CHAT_ASSETS_SLUG,
      id: asset.id,
      depth: 0,
      overrideAccess: true,
    })) as StoredAsset;
  }

  function attached(asset: Asset, text: string): string {
    return `Attached file "${asset.filename}":\n${text}`;
  }

  function reference(asset: Asset, part: Part = {}): Part {
    return {
      type: 'file-reference',
      id: asset.id,
      filename: asset.filename,
      mediaType: asset.mimeType,
      ...part,
    };
  }

  function userMessage(...parts: Part[]): UIMessage {
    return { id: `user-${++sequence}`, role: 'user', parts } as UIMessage;
  }

  async function post(body: unknown) {
    const response = await fetch(`${booted.baseUrl}/api/agents/${questionAgentSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `JWT ${token}` },
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

  async function onlyChatId(): Promise<number | string> {
    const { docs } = await booted.frogbot.find({
      collection: chatsSlug,
      depth: 0,
      overrideAccess: true,
    });

    return docs[0].id;
  }

  async function turnState(chatId: number | string) {
    return findTurnState({ req: await booted.frogbot.createRequest({}), chatId });
  }

  async function goneAsset(): Promise<Asset> {
    const asset = await upload({ name: 'ghost.png', type: 'image/png', data: PNG });

    await booted.frogbot.delete({
      collection: CHAT_ASSETS_SLUG,
      id: asset.id,
      overrideAccess: true,
    });

    return asset;
  }

  async function startSlowTurn() {
    const hold = deferred();

    model.respond({ text: 'Slow reply.', hold: hold.promise });

    const running = post({ prompt: 'Start.', model: 'test/media' });

    await vi.waitFor(() => expect(model.requests).toHaveLength(1));

    return { chatId: await onlyChatId(), hold, running };
  }

  it('GET /api/agents lists input types only for models that declare them', async () => {
    const response = await fetch(`${booted.baseUrl}/api/agents`, {
      headers: { authorization: `JWT ${token}` },
    });

    const { agents } = (await response.json()) as {
      agents: Array<{ slug: string; inputs?: Record<string, string[]> }>;
    };

    expect(agents.find(({ slug }) => slug === questionAgentSlug)?.inputs).toEqual({
      'test/text-only': ['text'],
      'test/media': ['text', 'image', 'audio', 'video', 'pdf'],
    });
  });

  it('labels text files, code files by their real name, and pasted text', async () => {
    const notes = await upload({ name: 'notes.md', type: 'text/markdown', data: '# Notes' });
    const code = await upload({ name: 'app.js.txt', type: 'text/plain', data: 'console.log(1);' });
    const paste = await upload({ name: 'pasted-1.txt', type: 'text/plain', data: 'Long paste.' });

    const response = await post({
      messages: [
        userMessage(
          { type: 'text', text: 'Read these.' },
          reference(notes, { filename: 'notes.md' }),
          reference(code, { filename: 'app.js', mediaType: 'text/plain' }),
          reference(paste, { filename: 'Pasted text', mediaType: 'text/plain', origin: 'paste' }),
        ),
      ],
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      [
        'Read these.',
        'Attached file "notes.md":\n# Notes',
        'Attached file "app.js":\nconsole.log(1);',
        'Pasted text:\nLong paste.',
      ],
    ]);
  });

  it('replaces an image a text-only model cannot read and keeps the saved message', async () => {
    const photo = await upload({ name: 'photo.png', type: 'image/png', data: PNG });

    const parts = [
      { type: 'text', text: 'What is this?' },
      reference(photo, { filename: 'photo.png' }),
    ];

    const response = await post({ messages: [userMessage(...parts)], model: 'test/text-only' });

    const [saved] = await storedMessages(response.body.chatId);

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([['What is this?', imageMarker]]);
    expect(saved?.parts).toEqual(parts);
  });

  it('replaces an unsupported file with a marker on Send', async () => {
    const archive = await upload({ name: 'archive.zip', type: 'application/zip', data: ZIP });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Unzip this.' }, reference(archive))],
      model: 'test/media',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Unzip this.', `[Can't read ${archive.filename}: this file type isn't supported]`],
    ]);
  });

  it('replaces an unsupported file with a marker through the Local API', async () => {
    const archive = await upload({ name: 'archive.zip', type: 'application/zip', data: ZIP });

    const req = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
    } as never);

    await booted.frogbot.agents[questionAgentSlug]!.generate({
      req,
      messages: [userMessage({ type: 'text', text: 'Unzip this.' }, reference(archive))],
    });

    expect(userContent(model.requests[0])).toEqual([
      ['Unzip this.', `[Can't read ${archive.filename}: this file type isn't supported]`],
    ]);
  });

  it('generateText sends a file the model cannot read unchanged', async () => {
    await booted.frogbot.generateText({
      model: 'test/text-only',
      tools: [noop],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'file', data: PNG, mediaType: 'image/png' },
          ],
        },
      ],
    });

    expect(userContent(model.requests[0])).toEqual([['What is this?', 'image']]);
  });

  it('sends a saved image again after a question is answered', async () => {
    const photo = await upload({ name: 'photo.png', type: 'image/png', data: PNG });

    model.respond(
      { toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }] },
      { text: 'A frog.' },
    );

    const asked = await post({
      messages: [userMessage({ type: 'text', text: 'What is this?' }, reference(photo))],
      model: 'test/media',
    });

    const settled = await fetch(
      `${booted.baseUrl}/api/agents/${questionAgentSlug}/chats/${asked.body.chatId}/settle`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `JWT ${token}` },
        body: JSON.stringify({
          toolCallId: 'call-question',
          output: { answers: [{ header: 'Color', selected: ['Red'] }] },
        }),
      },
    );

    expect([asked.body.status, settled.status]).toEqual(['awaiting-input', 200]);
    expect(model.requests.map(userContent)).toEqual([
      [['What is this?', 'image']],
      [['What is this?', 'image']],
    ]);
  });

  it('sends a saved image on a queued turn', async () => {
    const photo = await upload({ name: 'photo.png', type: 'image/png', data: PNG });
    const { chatId, hold, running } = await startSlowTurn();

    const queued = await post({
      chatId,
      messages: [userMessage({ type: 'text', text: 'And this?' }, reference(photo))],
      model: 'test/media',
    });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect(queued.status).toBe(202);
    expect(userContent(model.requests[1])).toEqual([['Start.'], ['And this?', 'image']]);
  });

  it('fails Send with 404 for a missing file and releases the chat', async () => {
    const ghost = await goneAsset();

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Look.' }, reference(ghost))],
    });

    expect(response.status).toBe(404);
    expect(model.requests).toEqual([]);
    await expect(turnState(await onlyChatId())).resolves.toBe('idle');
  });

  it('replaces a missing file with a marker on a queued turn', async () => {
    const ghost = await goneAsset();
    const { chatId, hold, running } = await startSlowTurn();

    await post({
      chatId,
      messages: [userMessage({ type: 'text', text: 'Look.' }, reference(ghost))],
      model: 'test/media',
    });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });
    await vi.waitFor(() => expect(turnState(chatId)).resolves.toBe('idle'), { timeout: 10_000 });

    expect(userContent(model.requests[1])).toEqual([
      ['Start.'],
      ['Look.', `[Can't read ${ghost.filename}: the file couldn't be loaded]`],
    ]);
  });

  it('sends a repeated screenshot once, as its newest copy', async () => {
    const first = await upload({ name: 'shot.png', type: 'image/png', data: PNG });
    const second = await upload({ name: 'shot.png', type: 'image/png', data: PNG });

    const opened = await post({
      messages: [
        userMessage({ type: 'text', text: 'Look.' }, reference(first, { filename: 'shot.png' })),
      ],
      model: 'test/media',
    });

    await post({
      chatId: opened.body.chatId,
      messages: [
        userMessage({ type: 'text', text: 'Again.' }, reference(second, { filename: 'shot.png' })),
      ],
      model: 'test/media',
    });

    expect(userContent(model.requests[1])).toEqual([
      ['Look.', '[File repeated later: shot.png]'],
      ['Again.', 'image'],
    ]);
  });

  it('removes the oldest files over the size limit and completes the turn', async () => {
    const report = await upload({
      name: 'report.pdf',
      type: 'application/pdf',
      data: pdf(9 * MiB),
    });

    const first = await upload({
      name: 'first.png',
      type: 'image/png',
      data: padded({ head: PNG, size: 9 * MiB }),
    });

    const second = await upload({
      name: 'second.png',
      type: 'image/png',
      data: padded({ head: PNG, size: 9 * MiB, fill: 1 }),
    });

    const parts = [
      { type: 'text', text: 'Compare.' },
      reference(report),
      reference(first),
      reference(second),
    ];

    const response = await post({ messages: [userMessage(...parts)], model: 'test/media' });

    const [saved] = await storedMessages(response.body.chatId);

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      [
        'Compare.',
        `[File removed: ${report.filename}]`,
        `[Image removed: ${first.filename}]`,
        'image',
      ],
    ]);
    expect(saved?.parts).toEqual(parts);
  });

  it('loads an asset that has no stored hash', async () => {
    const photo = await upload({ name: 'photo.png', type: 'image/png', data: PNG });

    await booted.frogbot.db.updateOne({
      collection: CHAT_ASSETS_SLUG,
      id: photo.id,
      data: { sha256: null },
    });

    const stored = (await booted.frogbot.findByID({
      collection: CHAT_ASSETS_SLUG,
      id: photo.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as { sha256?: string | null };

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'What is this?' }, reference(photo))],
      model: 'test/media',
    });

    expect(stored.sha256 ?? null).toBeNull();
    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([['What is this?', 'image']]);
  });

  it("replaces another user's asset with a marker on a queued turn and leaves it unlinked", async () => {
    const photo = await upload({ name: 'photo.png', type: 'image/png', data: PNG });

    ({ token } = await signIn());

    const { chatId, hold, running } = await startSlowTurn();

    await post({
      chatId,
      messages: [userMessage({ type: 'text', text: 'And this?' }, reference(photo))],
      model: 'test/media',
    });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    const asset = (await booted.frogbot.findByID({
      collection: CHAT_ASSETS_SLUG,
      id: photo.id,
      depth: 0,
      overrideAccess: true,
    })) as { chat?: unknown };

    expect(userContent(model.requests[1])).toEqual([
      ['Start.'],
      ['And this?', `[Can't read ${photo.filename}: the file couldn't be loaded]`],
    ]);
    expect(asset.chat ?? null).toBeNull();
  });

  it('inlines a TypeScript file recorded as video for a text-only model', async () => {
    const code = await upload({ name: 'index.ts', type: 'video/mp2t', data: 'const a = 1;' });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Review.' }, reference(code))],
      model: 'test/text-only',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Review.', `Attached file "${code.filename}":\nconst a = 1;`],
    ]);
  });

  it('sends a PDF uploaded without a specific type as a PDF', async () => {
    const report = await upload({
      name: 'report.pdf',
      type: 'application/octet-stream',
      data: pdf(1024),
    });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Summarize.' }, reference(report))],
      model: 'test/media',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([['Summarize.', `pdf ${report.filename}`]]);
  });

  it('replaces a single PDF over the size limit and completes the turn', async () => {
    const report = await upload({
      name: 'report.pdf',
      type: 'application/pdf',
      data: pdf(19 * MiB),
    });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Summarize.' }, reference(report))],
      model: 'test/media',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Summarize.', `[File removed: ${report.filename}]`],
    ]);
  });

  it('links a new file once when two turns send it at the same time', async () => {
    const shot = await upload({ name: 'shot.png', type: 'image/png', data: PNG });
    const message = () => userMessage({ type: 'text', text: 'Describe.' }, reference(shot));

    const responses = await Promise.all([
      post({ messages: [message()], model: 'test/media' }),
      post({ messages: [message()], model: 'test/media' }),
    ]);

    expect(responses.map(({ status, body }) => [status, body.error])).toEqual([
      [200, undefined],
      [200, undefined],
    ]);
    expect(responses.map(({ body }) => body.chatId)).toContain((await storedAsset(shot)).chat);
  });

  it('sends one of two identical files uploaded at the same time', async () => {
    const [first, second] = await Promise.all([
      upload({ name: 'shot.png', type: 'image/png', data: PNG }),
      upload({ name: 'shot-copy.png', type: 'image/png', data: PNG }),
    ]);

    const response = await post({
      messages: [
        userMessage({ type: 'text', text: 'Compare.' }, reference(first), reference(second)),
      ],
      model: 'test/media',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Compare.', `[File repeated later: ${first.filename}]`, 'image'],
    ]);
  });

  it('inlines invalid UTF-8 with replacement characters and marks UTF-16 as unsupported', async () => {
    const latin = await upload({
      name: 'latin.txt',
      type: 'text/plain',
      data: Buffer.from('caf\xe9', 'latin1'),
    });

    const wide = await upload({
      name: 'wide.txt',
      type: 'text/plain',
      data: Buffer.from('\ufeffhello', 'utf16le'),
    });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Read.' }, reference(latin), reference(wide))],
      model: 'test/media',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      [
        'Read.',
        `Attached file "${latin.filename}":\ncaf\ufffd`,
        `[Can't read ${wide.filename}: this file type isn't supported]`,
      ],
    ]);
  });

  it('sends Word and Excel attachments as their labelled text', async () => {
    const report = await reportUpload();
    const budget = await budgetUpload();

    const response = await post({
      messages: [
        userMessage({ type: 'text', text: 'Compare.' }, reference(report), reference(budget)),
      ],
      model: 'test/text-only',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Compare.', attached(report, reportText), attached(budget, budgetText)],
    ]);
  });

  it('sends the same Word and Excel text through the Local API as through REST', async () => {
    const report = await reportUpload();
    const budget = await budgetUpload();

    const message = () =>
      userMessage({ type: 'text', text: 'Compare.' }, reference(report), reference(budget));

    await post({ messages: [message()], model: 'test/text-only' });

    const req = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
    } as never);

    await booted.frogbot.agents[questionAgentSlug]!.generate({ req, messages: [message()] });

    expect(userContent(model.requests[1])).toEqual(userContent(model.requests[0]));
  });

  it('reads a Word document stored without text once and keeps its text', async () => {
    const report = await withoutText(await reportUpload());

    const opened = await post({
      messages: [userMessage({ type: 'text', text: 'Summarize.' }, reference(report))],
      model: 'test/text-only',
    });

    const stored = await storedAsset(report);

    await fs.rm(path.resolve(CHAT_ASSETS_SLUG, report.filename));

    const followUp = await post({ chatId: opened.body.chatId, prompt: 'And now?' });

    expect(stored.text).toBe(reportText);
    expect(followUp.status).toBe(200);
    expect(userContent(model.requests[1])).toEqual([
      ['Summarize.', attached(report, reportText)],
      ['And now?'],
    ]);
  });

  it('reads a Word document stored without text on a queued turn', async () => {
    const report = await withoutText(await reportUpload());
    const { chatId, hold, running } = await startSlowTurn();

    await post({
      chatId,
      messages: [userMessage({ type: 'text', text: 'And this?' }, reference(report))],
      model: 'test/text-only',
    });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect(userContent(model.requests[1])).toEqual([
      ['Start.'],
      ['And this?', attached(report, reportText)],
    ]);

    await vi.waitFor(async () => expect((await storedAsset(report)).text).toBe(reportText));
  });

  it('stores the text when two turns at once read a Word document already in a chat', async () => {
    const report = await reportUpload();

    await post({
      messages: [userMessage({ type: 'text', text: 'Link.' }, reference(report))],
      model: 'test/text-only',
    });

    await withoutText(report);

    const message = () => userMessage({ type: 'text', text: 'Summarize.' }, reference(report));

    const responses = await Promise.all([
      post({ messages: [message()], model: 'test/text-only' }),
      post({ messages: [message()], model: 'test/text-only' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect((await storedAsset(report)).text).toBe(reportText);
  });

  it('sends the same text on two turns that read a Word document at once', async () => {
    const report = await reportUpload();

    await post({
      messages: [userMessage({ type: 'text', text: 'Link.' }, reference(report))],
      model: 'test/text-only',
    });

    await withoutText(report);

    const message = () => userMessage({ type: 'text', text: 'Summarize.' }, reference(report));

    const responses = await Promise.all([
      post({ messages: [message()], model: 'test/text-only' }),
      post({ messages: [message()], model: 'test/text-only' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(model.requests.slice(1).map(userContent)).toEqual([
      [['Summarize.', attached(report, reportText)]],
      [['Summarize.', attached(report, reportText)]],
    ]);
    expect((await storedAsset(report)).text).toBe(reportText);
  });

  it('keeps the owner when a chat reader’s turn stores the text', async () => {
    const report = await reportUpload();
    const opened = await post({
      messages: [userMessage(reference(report))],
      model: 'test/text-only',
    });

    await withoutText(report);

    const reader = await signIn();

    await booted.frogbot.update({
      collection: chatsSlug,
      id: opened.body.chatId,
      data: { sharedWith: [reader.user.id] },
      overrideAccess: true,
    });

    const req = await booted.frogbot.createRequest({
      user: { ...reader.user, collection: usersSlug },
    } as never);

    await booted.frogbot.agents[questionAgentSlug]!.generate({
      req,
      messages: [userMessage({ type: 'text', text: 'Read.' }, reference(report))],
    });

    const stored = await storedAsset(report);

    expect(userContent(model.requests[1])).toEqual([['Read.', attached(report, reportText)]]);
    expect(stored).toMatchObject({ owner: user.id, text: reportText });
  });

  it('replaces an unreadable workbook stored without text with a marker', async () => {
    const data = Buffer.from(encryptedOfficeFile());

    const locked = (await booted.frogbot.create({
      collection: CHAT_ASSETS_SLUG,
      data: { owner: user.id },
      file: { data, mimetype: XLSX_TYPE, name: 'locked.xlsx', size: data.byteLength },
      context: { [SKIP_ASSET_TEXT_CONTEXT_KEY]: true },
      overrideAccess: true,
    })) as Asset;

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Total?' }, reference(locked))],
      model: 'test/text-only',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Total?', `[Can't read ${locked.filename}: the file couldn't be read]`],
    ]);
    expect((await storedAsset(locked)).text ?? null).toBeNull();
  });

  it('answers a turn with a workbook stored without text that holds an out-of-range date', async () => {
    const data = Buffer.from(
      xlsxFile({
        sheets: [
          {
            name: 'Q1',
            xml: '<sheetData><row r="1"><c r="A1" s="1"><v>1e300</v></c></row></sheetData>',
          },
        ],
        styles:
          '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>',
      }),
    );

    const dates = (await booted.frogbot.create({
      collection: CHAT_ASSETS_SLUG,
      data: { owner: user.id },
      file: { data, mimetype: XLSX_TYPE, name: 'dates.xlsx', size: data.byteLength },
      context: { [SKIP_ASSET_TEXT_CONTEXT_KEY]: true },
      overrideAccess: true,
    })) as Asset;

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'When?' }, reference(dates))],
      model: 'test/text-only',
    });

    expect(response.status).toBe(200);
  });

  it('replaces a PowerPoint file with the unsupported marker', async () => {
    const deck = await upload({
      name: 'deck.pptx',
      type: PPTX_TYPE,
      data: Buffer.from(reportDocx()),
    });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Present.' }, reference(deck))],
      model: 'test/text-only',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Present.', `[Can't read ${deck.filename}: this file type isn't supported]`],
    ]);
  });

  it('sends a Word document’s stored text on three turns without reading the file', async () => {
    const report = await reportUpload();

    await fs.rm(path.resolve(CHAT_ASSETS_SLUG, report.filename));

    const opened = await post({
      messages: [userMessage({ type: 'text', text: 'One.' }, reference(report))],
      model: 'test/text-only',
    });

    await post({ chatId: opened.body.chatId, prompt: 'Two.' });

    const third = await post({ chatId: opened.body.chatId, prompt: 'Three.' });

    expect(third.status).toBe(200);
    expect(model.requests.map(userContent)).toEqual([
      [['One.', attached(report, reportText)]],
      [['One.', attached(report, reportText)], ['Two.']],
      [['One.', attached(report, reportText)], ['Two.'], ['Three.']],
    ]);
  });

  it('sends the same text for a Word document uploaded through REST, the SDK and the Local API', async () => {
    const sdk = createFrogBotSDK({
      baseURL: `${booted.baseUrl}/api`,
      headers: { authorization: `JWT ${token}` },
    });

    const data = Buffer.from(reportDocx());

    const assets = [
      await reportUpload(),
      (await sdk.upload(
        CHAT_ASSETS_SLUG,
        new File([data], 'report.docx', { type: DOCX_TYPE }),
      )) as Asset,
      (await booted.frogbot.create({
        collection: CHAT_ASSETS_SLUG,
        data: { owner: user.id },
        file: { data, mimetype: DOCX_TYPE, name: 'report.docx', size: data.byteLength },
        overrideAccess: true,
      })) as Asset,
    ];

    for (const asset of assets) {
      await post({
        messages: [userMessage({ type: 'text', text: 'Read.' }, reference(asset))],
        model: 'test/text-only',
      });
    }

    expect(model.requests.map(userContent)).toEqual(
      assets.map((asset) => [['Read.', attached(asset, reportText)]]),
    );
  });

  it('sends one copy of a Word document attached twice', async () => {
    const first = await reportUpload();
    const second = await reportUpload();

    await post({
      messages: [userMessage({ type: 'text', text: 'Read.' }, reference(first), reference(second))],
      model: 'test/text-only',
    });

    expect(userContent(model.requests[0])).toEqual([
      ['Read.', `[File repeated later: ${first.filename}]`, attached(second, reportText)],
    ]);
  });

  it('inlines a 5 MB Markdown file whole', async () => {
    const text = '# Notes\n'.padEnd(5_000_000, 'a');
    const notes = await upload({ name: 'notes.md', type: 'text/markdown', data: text });

    const response = await post({
      messages: [userMessage({ type: 'text', text: 'Read.' }, reference(notes))],
      model: 'test/text-only',
    });

    expect(response.status).toBe(200);
    expect(userContent(model.requests[0])).toEqual([
      ['Read.', `Attached file "${notes.filename}":\n${text}`],
    ]);
  });
});
