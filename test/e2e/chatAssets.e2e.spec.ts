import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot.js';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { generateDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import { startModelProvider } from './fixtures/chat-assets/provider.js';
import {
  agentSlug,
  answer,
  assetsSlug,
  chatsSlug,
  followUp,
  instructions,
  messagesSlug,
  modelId,
  note,
  prompt,
  report,
  toolCallId,
  toolSlug,
  usersSlug,
} from './fixtures/chat-assets/shared.js';

type User = { id: number | string; token: string };

type Asset = {
  id: number | string;
  filename: string;
  mimeType: string;
  filesize: number;
  url: string;
  owner: number | string;
  chat: number | string | null;
};

type Message = {
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
};

describe('chat assets HTTP e2e', () => {
  let booted: BootedFrogbot;
  let provider: Awaited<ReturnType<typeof startModelProvider>>;
  let dataDir: string;
  let owner: User;
  let reader: User;
  let stranger: User;
  let image: Buffer;

  async function request({
    path,
    user,
    body,
    method = body === undefined ? 'GET' : 'POST',
    accept = 'application/json',
  }: {
    path: string;
    user?: User;
    body?: unknown;
    method?: string;
    accept?: string;
  }) {
    return fetch(new URL(path, booted.baseUrl), {
      method,
      headers: {
        accept,
        ...(user ? { authorization: `Bearer ${user.token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  }

  async function json<T>(response: Response, status = 200): Promise<T> {
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(status);

    return body as T;
  }

  async function createUser(name: string): Promise<User> {
    const credentials = { email: `${name}@chat-assets.test`, password: 'chat-assets-password' };

    await json(await request({ path: `/api/${usersSlug}`, body: credentials }), 201);

    const login = await json<{ user: { id: number | string }; token: string }>(
      await request({ path: `/api/${usersSlug}/login`, body: credentials }),
    );

    return { id: login.user.id, token: login.token };
  }

  async function upload({
    user = owner,
    filename = 'note.txt',
    mimeType = 'text/plain',
    data = Buffer.from(note),
  }: {
    user?: User;
    filename?: string;
    mimeType?: string;
    data?: Buffer;
  } = {}): Promise<Asset> {
    const body = new FormData();

    body.set('_payload', '{}');
    body.set('file', new Blob([new Uint8Array(data)], { type: mimeType }), filename);

    const response = await fetch(`${booted.baseUrl}/api/${assetsSlug}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${user.token}` },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const { doc } = await json<{ doc: Asset }>(response, 201);

    return doc;
  }

  async function readAsset(asset: Asset, user = owner): Promise<Asset> {
    return json(await request({ path: `/api/${assetsSlug}/${asset.id}?depth=0`, user }));
  }

  async function download(asset: Asset, user?: User): Promise<Response> {
    return request({ path: new URL(asset.url, booted.baseUrl).pathname, user });
  }

  function message(assets: Asset[]) {
    return {
      id: 'attachment-message',
      role: 'user',
      parts: [
        { type: 'text', text: prompt },
        ...assets.map((asset) => ({
          type: 'file-reference',
          id: asset.id,
          filename: asset.filename,
          mediaType: asset.mimeType,
        })),
      ],
    };
  }

  async function transcript(chatId: number | string): Promise<Message[]> {
    const body = await json<{ docs: Message[] }>(
      await request({
        path: `/api/${messagesSlug}?where[chat][equals]=${chatId}&sort=createdAt&depth=0`,
        user: owner,
      }),
    );

    return body.docs;
  }

  async function submit({
    incoming,
    accept,
  }: {
    incoming: ReturnType<typeof message>;
    accept: string;
  }): Promise<number | string> {
    const response = await request({
      path: `/api/agents/${agentSlug}`,
      user: owner,
      body: { messages: [incoming] },
      accept,
    });

    if (accept === 'application/json') {
      const body = await json<{ chatId: number | string; text: string; finishReason: string }>(
        response,
      );

      expect(body.text).toBe(answer);
      expect(body.finishReason).toBe('stop');
      expect(body.chatId).toBeDefined();

      return body.chatId;
    }

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const chatId = response.headers.get('x-frogbot-chat-id');
    const stream = await response.text();
    const events = stream
      .split('\n')
      .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);

    expect(chatId).toBeTruthy();

    await expect.poll(async () => (await transcript(chatId!)).length).toBe(2);

    expect(
      events.filter(({ type }) => type === 'error' || type === 'tool-output-error'),
      JSON.stringify(provider.requests.at(-1)?.messages.at(-1)),
    ).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'finish' }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool-output-available', toolCallId }),
    );
    expect(
      events
        .filter(({ type }) => type === 'text-delta')
        .map(({ delta }) => delta)
        .join(''),
    ).toBe(answer);
    expect(stream).toContain('data: [DONE]');

    return chatId!;
  }

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'frogbot-chat-assets-e2e-'));
    provider = await startModelProvider();

    vi.stubEnv('CHAT_ASSETS_E2E_DATA_DIR', dataDir);
    vi.stubEnv('CHAT_ASSETS_E2E_PROVIDER_URL', provider.url);
    vi.stubEnv('FROGBOT_DATABASE', 'sqlite');
    generateDatabaseAdapter('sqlite');

    booted = await bootFrogbot(join(import.meta.dirname, 'fixtures/chat-assets'));
    image = await readFile(join(import.meta.dirname, '../uploads/image.png'));
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    provider.requests.length = 0;
    provider.unexpected.length = 0;

    owner = await createUser('owner');
    reader = await createUser('reader');
    stranger = await createUser('stranger');
  });

  afterEach(() => {
    expect(provider.unexpected).toEqual([]);
  });

  afterAll(async () => {
    try {
      await booted?.shutdown();
    } finally {
      await provider?.close();

      vi.unstubAllEnvs();

      if (dataDir) await rm(dataDir, { recursive: true, force: true });
    }
  });

  it.each(['application/json', 'text/event-stream'])(
    '%s uploads attachments, runs the asset tool, and applies chat sharing to downloads',
    async (accept) => {
      const manifest = await json<{ chat: { assetsSlug: string; chatsSlug: string } }>(
        await request({ path: '/api/frogbot', user: owner }),
      );

      expect(manifest.chat).toMatchObject({ assetsSlug, chatsSlug });

      const textAsset = await upload();
      const imageAsset = await upload({
        filename: 'image.png',
        mimeType: 'image/png',
        data: image,
      });

      expect(await readAsset(textAsset)).toMatchObject({ owner: owner.id, chat: null });
      expect((await download(textAsset, reader)).status).toBe(403);

      const incoming = message([textAsset, imageAsset]);
      const chatId = await submit({ incoming, accept });

      expect(provider.requests).toHaveLength(2);
      expect(provider.requests[0]).toMatchObject({ model: modelId });
      expect(provider.requests[0]?.messages).toEqual([
        { role: 'system', content: instructions },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'text', text: note },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
            },
          ],
        },
      ]);
      expect(provider.requests[0]?.tools?.map(({ function: tool }) => tool.name)).toEqual([
        toolSlug,
      ]);

      const chat = await json<{ id: number | string; user: number | string; agent: string }>(
        await request({ path: `/api/${chatsSlug}/${chatId}?depth=0`, user: owner }),
      );

      expect(chat).toMatchObject({ user: owner.id, agent: agentSlug });

      await expect.poll(async () => (await transcript(chatId)).length).toBe(2);

      const messages = await transcript(chatId);

      expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
      expect(messages[0]).toMatchObject(incoming);
      expect(messages[0]?.parts).toEqual(incoming.parts);

      const toolPart = messages[1]?.parts.find(({ type }) => type === `tool-${toolSlug}`);

      expect(toolPart).toMatchObject({
        state: 'output-available',
        toolCallId,
        input: { content: report },
        output: {
          filename: 'report.txt',
          mimeType: 'text/plain',
          filesize: Buffer.byteLength(report),
        },
      });

      const generatedAsset = toolPart!.output as Asset;
      const secondRequest = provider.requests[1]!;

      expect(secondRequest.messages.slice(0, 2)).toEqual(provider.requests[0]!.messages);
      expect(secondRequest.messages.at(-2)).toMatchObject({
        role: 'assistant',
        tool_calls: [
          {
            id: toolCallId,
            type: 'function',
            function: { name: toolSlug, arguments: JSON.stringify({ content: report }) },
          },
        ],
      });
      expect(secondRequest.messages.at(-1)).toMatchObject({
        role: 'tool',
        tool_call_id: toolCallId,
      });
      expect(JSON.parse(secondRequest.messages.at(-1)!.content as string)).toEqual(generatedAsset);

      const assets = [textAsset, imageAsset, generatedAsset];

      for (const asset of assets) {
        expect(await readAsset(asset)).toMatchObject({ owner: owner.id, chat: chat.id });
        expect((await download(asset, reader)).status).toBe(403);
      }

      await json(
        await request({
          path: `/api/${chatsSlug}/${chatId}`,
          method: 'PATCH',
          user: owner,
          body: { sharedWith: [reader.id] },
        }),
      );

      const contents = [Buffer.from(note), image, Buffer.from(report)];

      for (const [index, asset] of assets.entries()) {
        expect(await readAsset(asset, reader)).toMatchObject({ id: asset.id, chat: chat.id });

        for (const user of [owner, reader]) {
          const response = await download(asset, user);

          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toContain(asset.mimeType);
          expect(Buffer.from(await response.arrayBuffer())).toEqual(contents[index]);
        }

        expect((await download(asset, stranger)).status).toBe(403);
        expect((await download(asset)).status).toBe(403);
        expect(
          (await request({ path: `/api/${assetsSlug}/${asset.id}`, user: stranger })).status,
        ).toBe(404);
      }

      await json(
        await request({
          path: `/api/${chatsSlug}/${chatId}`,
          method: 'PATCH',
          user: owner,
          body: { sharedWith: [] },
        }),
      );

      for (const asset of assets) {
        expect((await download(asset, reader)).status).toBe(403);
        expect((await download(asset, owner)).status).toBe(200);
      }
    },
  );

  it('resolves stored file references again when continuing a chat through HTTP', async () => {
    const asset = await upload();
    const incoming = message([asset]);
    const chatId = await submit({ incoming, accept: 'application/json' });
    const firstTranscript = await transcript(chatId);

    expect(firstTranscript[0]).toMatchObject(incoming);
    expect(provider.requests).toHaveLength(2);

    const response = await json<{ chatId: number | string; text: string }>(
      await request({
        path: `/api/agents/${agentSlug}`,
        user: owner,
        body: { chatId, prompt: followUp },
      }),
    );

    expect(response).toMatchObject({ chatId, text: answer });
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[2]?.messages).toEqual([
      ...provider.requests[1]!.messages,
      { role: 'assistant', content: answer },
      { role: 'user', content: followUp },
    ]);

    const messages = await transcript(chatId);

    expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages[0]).toEqual(firstTranscript[0]);
    expect(await readAsset(asset)).toMatchObject({ owner: owner.id, chat: chatId });
  });

  it('rejects another user’s uploaded reference before calling the model', async () => {
    const asset = await upload({ user: stranger });

    const response = await request({
      path: `/api/agents/${agentSlug}`,
      user: owner,
      body: { messages: [message([asset])] },
    });

    await json(response, 404);

    expect(provider.requests).toEqual([]);
    expect(await readAsset(asset, stranger)).toMatchObject({ owner: stranger.id, chat: null });
    expect((await download(asset, owner)).status).toBe(403);
  });
});
