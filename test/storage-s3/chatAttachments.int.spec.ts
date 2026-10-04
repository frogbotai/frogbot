import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { UIMessage } from 'ai';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { placeholderChatTitle } from '../../packages/frogbot/src/chat/title.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { reportDocx, reportText } from '../__helpers/shared/office.js';
import type { StubChatModel, StubChatRequest } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import {
  agentSlug,
  bucket,
  chatAssetsSlug,
  chatsSlug,
  messagesSlug,
  modelPort,
  s3ClientConfig,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-int-password';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Asset = { id: number | string; filename: string; mimeType: string };

type SentPart = { type: string; text?: string };

function userContent(request: StubChatRequest): string[][] {
  return request.messages
    .filter(({ role }) => role === 'user')
    .map(({ content }) =>
      typeof content === 'string'
        ? [content]
        : (content as SentPart[]).map((part) =>
            part.type === 'text' ? part.text! : part.type === 'image_url' ? 'image' : part.type,
          ),
    );
}

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('chat attachments stored in S3', () => {
  const client = new S3Client(s3ClientConfig);
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let user: { id: number | string };
  let token: string;
  let sequence = 0;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'storage-s3-chat');
  });

  beforeEach(async () => {
    model.reset();

    await clearAndSeed(booted.frogbot, 'empty');

    const email = `owner-${++sequence}@frogbot.local`;

    user = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    })) as { id: number | string };

    const login = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    token = ((await login.json()) as { token: string }).token;
  });

  afterEach(async () => {
    await vi.waitFor(async () => {
      const chats = await booted.frogbot.find({
        collection: chatsSlug,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });

      const naming = await Promise.all(
        chats.docs.map(async ({ id, title }) => {
          const { docs } = await booted.frogbot.find({
            collection: messagesSlug,
            where: { chat: { equals: id } },
            sort: ['createdAt', 'id'],
            pagination: false,
            depth: 0,
            overrideAccess: true,
          });

          const messages = docs as unknown as Parameters<typeof placeholderChatTitle>[0];

          return !title || title === placeholderChatTitle(messages);
        }),
      );

      if (naming.some(Boolean)) throw new Error('Chat titles are still being generated');
    });
  });

  afterAll(async () => {
    client.destroy();
    await booted.shutdown();
    await model.close();
    await fs.rm(path.resolve(chatAssetsSlug), { recursive: true, force: true });
  });

  async function upload({
    name = 'photo.png',
    type = 'image/png',
    data = PNG,
  }: {
    name?: string;
    type?: string;
    data?: Uint8Array;
  } = {}): Promise<Asset> {
    const body = new FormData();

    body.set('_payload', '{}');
    body.set('file', new Blob([new Uint8Array(data)], { type }), name);

    const response = await fetch(`${booted.baseUrl}/api/${chatAssetsSlug}`, {
      method: 'POST',
      headers: { authorization: `JWT ${token}` },
      body,
    });

    if (!response.ok) throw new Error(`Upload failed: ${await response.text()}`);

    return ((await response.json()) as { doc: Asset }).doc;
  }

  function fileMessage(asset: Asset, text: string): UIMessage {
    return {
      id: `user-${++sequence}`,
      role: 'user',
      parts: [
        { type: 'text', text },
        {
          type: 'file-reference',
          id: asset.id,
          filename: asset.filename,
          mediaType: asset.mimeType,
        },
      ],
    } as UIMessage;
  }

  function reportUpload(): Promise<Asset> {
    return upload({ name: 'report.docx', type: DOCX_TYPE, data: reportDocx() });
  }

  async function storedText(asset: Asset): Promise<string | null | undefined> {
    const doc = await booted.frogbot.findByID({
      collection: chatAssetsSlug,
      id: asset.id,
      depth: 0,
      overrideAccess: true,
    });

    return (doc as { text?: string | null }).text;
  }

  async function post(body: unknown) {
    const response = await fetch(`${booted.baseUrl}/api/agents/${agentSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `JWT ${token}` },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: (await response.json()) as { chatId: string } };
  }

  async function startSlowTurn() {
    const hold = deferred();

    model.respond({ text: 'Slow reply.', hold: hold.promise });

    const running = post({ prompt: 'Start.' });

    await vi.waitFor(() => expect(model.requests).toHaveLength(1));

    const { docs } = await booted.frogbot.find({
      collection: chatsSlug,
      depth: 0,
      overrideAccess: true,
    });

    return { chatId: docs[0]!.id, hold, running };
  }

  it('sends an image stored only in S3 on Send', async () => {
    const photo = await upload();

    const response = await post({ messages: [fileMessage(photo, 'What is this?')] });

    await expect(fs.access(path.resolve(chatAssetsSlug, photo.filename))).rejects.toThrow();
    expect(response.status).toBe(200);
    expect(userContent(model.requests[0]!)).toEqual([['What is this?', 'image']]);
  });

  it('sends an image stored in S3 on a queued turn without cookies', async () => {
    const photo = await upload();
    const { chatId, hold, running } = await startSlowTurn();

    await post({ chatId, messages: [fileMessage(photo, 'And this?')] });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect(userContent(model.requests[1]!)).toEqual([['Start.'], ['And this?', 'image']]);
  });

  it('sends an image stored in S3 through Local API streamMessage', async () => {
    const photo = await upload();
    const opened = await post({ prompt: 'Start.' });

    const req = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
    } as never);

    const turn = (await booted.frogbot.agents[agentSlug]!.streamMessage({
      req,
      chatId: opened.body.chatId,
      messages: [fileMessage(photo, 'What is this?')],
    })) as { persistence: Promise<void> };

    await turn.persistence;

    expect(userContent(model.requests[1]!)).toEqual([['Start.'], ['What is this?', 'image']]);
  });

  it('replaces an image whose S3 object is gone with a marker on a queued turn', async () => {
    const photo = await upload();

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: photo.filename }));

    const { chatId, hold, running } = await startSlowTurn();

    await post({ chatId, messages: [fileMessage(photo, 'And this?')] });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect(userContent(model.requests[1]!)).toEqual([
      ['Start.'],
      ['And this?', `[Can't read ${photo.filename}: the file couldn't be loaded]`],
    ]);
  });

  it('keeps an uploaded Word document in S3 and its text in the database', async () => {
    const report = await reportUpload();

    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: report.filename }),
    );

    await expect(fs.access(path.resolve(chatAssetsSlug, report.filename))).rejects.toThrow();
    expect(await object.Body!.transformToByteArray()).toEqual(reportDocx());
    expect(await storedText(report)).toBe(reportText);
  });

  it('reads a Word document stored in S3 without text on a queued turn and keeps its text', async () => {
    const report = await reportUpload();

    await booted.frogbot.db.updateOne({
      collection: chatAssetsSlug,
      id: report.id,
      data: { text: null },
    });

    const { chatId, hold, running } = await startSlowTurn();

    await post({ chatId, messages: [fileMessage(report, 'Summarize.')] });

    hold.resolve();
    await running;

    await vi.waitFor(() => expect(model.requests).toHaveLength(2), { timeout: 10_000 });

    expect(userContent(model.requests[1]!)).toEqual([
      ['Start.'],
      ['Summarize.', `Attached file "${report.filename}":\n${reportText}`],
    ]);
    await vi.waitFor(async () => expect(await storedText(report)).toBe(reportText));
  });
});
