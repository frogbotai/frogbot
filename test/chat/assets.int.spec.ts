import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UIMessage } from 'ai';
import { resolveChatContext } from 'frogbot/test';
import { saveChatAsset } from 'frogbot/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHAT_ASSETS_SLUG } from '../../packages/frogbot/src/chat/collections/assets.js';
import type { ToolCtx } from '../../packages/frogbot/src/tools/types.js';
import { resolveChatAttachments } from '../../packages/frogbot/src/uploads/resolveChatAttachments.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { agentSlug, chatsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type User = { id: number | string };

type Asset = {
  id: number | string;
  filename: string;
  mimeType: string;
  owner: number | string | null;
  chat: number | string | null;
};

const password = 'frogbot-int-password';

describe('chat assets', () => {
  let booted: BootedFrogBot;
  let owner: User;
  let stranger: User;
  let ownerToken: string;
  let strangerToken: string;
  let sequence = 0;

  async function createUser(email: string): Promise<{ user: User; token: string }> {
    const user = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    })) as User;

    const response = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${usersSlug}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );

    const { token } = (await response.json()) as { token: string };

    return { user, token };
  }

  async function upload(token: string | undefined, content = 'hello'): Promise<Response> {
    sequence += 1;

    const body = new FormData();
    body.set('_payload', '{}');
    body.set('file', new Blob([content], { type: 'text/plain' }), `note-${sequence}.txt`);

    return booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}`, {
        method: 'POST',
        headers: token ? { authorization: `JWT ${token}` } : {},
        body,
      }),
    );
  }

  async function uploadAsset(token: string): Promise<Asset> {
    const response = await upload(token);

    expect(response.status).toBe(201);

    const { doc } = (await response.json()) as { doc: Asset };

    return doc;
  }

  async function get(pathname: string, token?: string): Promise<Response> {
    return booted.frogbot.handleRequest(
      new Request(`http://localhost${pathname}`, {
        headers: token ? { authorization: `JWT ${token}` } : {},
      }),
    );
  }

  async function requestFor(user: User) {
    return booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } } as never);
  }

  async function createChat(user: User): Promise<number | string> {
    const req = await requestFor(user);

    const result = await resolveChatContext({
      req,
      agentSlug,
      incoming: [{ id: `chat-${++sequence}`, role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
      tools: {},
    });

    return result.chatId!;
  }

  async function readAsset(id: number | string): Promise<Asset> {
    return (await booted.frogbot.findByID({
      collection: CHAT_ASSETS_SLUG,
      id,
      depth: 0,
      overrideAccess: true,
    })) as Asset;
  }

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'chat-assets');

    const created = await Promise.all([
      createUser('owner@frogbot.local'),
      createUser('stranger@frogbot.local'),
    ]);

    owner = created[0].user;
    ownerToken = created[0].token;
    stranger = created[1].user;
    strangerToken = created[1].token;
  });

  afterAll(async () => {
    await booted.shutdown();
    await fs.rm(path.resolve(CHAT_ASSETS_SLUG), { recursive: true, force: true });
  });

  it('exposes the assets slug in the manifest and hides the collection from the admin', async () => {
    const response = await get('/api/frogbot', ownerToken);
    const manifest = (await response.json()) as { chat: { assetsSlug?: string } };

    expect(manifest.chat.assetsSlug).toBe(CHAT_ASSETS_SLUG);

    const payloadConfig = await booted.frogbot.config._internal.payloadConfig;
    const assets = payloadConfig.collections.find(({ slug }) => slug === CHAT_ASSETS_SLUG);

    expect(assets?.admin.hidden).toBe(true);
    expect(assets?.upload).toBeTruthy();
  });

  it('records the uploader as owner and leaves the chat unset', async () => {
    const doc = await uploadAsset(ownerToken);
    const stored = await readAsset(doc.id);

    expect(stored.owner).toBe(owner.id);
    expect(stored.chat ?? null).toBeNull();
    expect(stored.mimeType).toBe('text/plain');
  });

  it('rejects anonymous uploads', async () => {
    const response = await upload(undefined);

    expect(response.status).toBe(403);
  });

  it('lets the owner read and download an unlinked asset', async () => {
    const doc = await uploadAsset(ownerToken);

    const record = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, ownerToken);
    const file = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, ownerToken);

    expect(record.status).toBe(200);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('hello');
  });

  it('hides an unlinked asset from other users and anonymous callers', async () => {
    const doc = await uploadAsset(ownerToken);

    const strangerRecord = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, strangerToken);
    const strangerFile = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, strangerToken);
    const anonymousFile = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`);

    expect(strangerRecord.status).toBe(404);
    expect(strangerFile.status).toBe(403);
    expect(anonymousFile.status).toBe(403);
  });

  it('refuses updates and deletes through the API', async () => {
    const doc = await uploadAsset(ownerToken);

    const patch = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}/${doc.id}`, {
        method: 'PATCH',
        headers: { authorization: `JWT ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ chat: null }),
      }),
    );
    const remove = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}/${doc.id}`, {
        method: 'DELETE',
        headers: { authorization: `JWT ${ownerToken}` },
      }),
    );

    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('links referenced assets to the chat on the first message and inlines their data', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const messages: UIMessage[] = [
      {
        id: 'm1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Read this' },
          { type: 'file-reference', id: doc.id } as never,
        ],
      },
    ];

    const resolved = await resolveChatAttachments({ req, messages, chatId });

    expect(resolved[0]?.parts[1]).toEqual({
      type: 'file',
      filename: doc.filename,
      mediaType: 'text/plain',
      url: `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`,
    });
    expect((await readAsset(doc.id)).chat).toBe(chatId);
  });

  it('refuses to attach another user’s asset', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(stranger);
    const req = await requestFor(stranger);
    const messages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'file-reference', id: doc.id } as never] },
    ];

    await expect(resolveChatAttachments({ req, messages, chatId })).rejects.toMatchObject({
      status: 404,
    });
    expect((await readAsset(doc.id)).chat ?? null).toBeNull();
  });

  it('grants access to whoever can read the linked chat', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(owner);
    const req = await requestFor(owner);

    await resolveChatAttachments({
      req,
      chatId,
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'file-reference', id: doc.id } as never] },
      ],
    });

    const before = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, strangerToken);

    expect(before.status).toBe(403);

    await booted.frogbot.update({
      collection: chatsSlug,
      id: chatId,
      data: { sharedWith: [stranger.id] },
      overrideAccess: true,
    });

    const record = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, strangerToken);
    const file = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, strangerToken);

    expect(record.status).toBe(200);
    expect(file.status).toBe(200);
  });

  it('saves agent-generated files against the current chat', async () => {
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-1', chatId },
    };

    const asset = await saveChatAsset({
      ctx,
      filename: 'screenshot.png',
      mimeType: 'image/png',
      data: await fs.readFile(path.resolve(dirname, '../uploads/image.png')),
    });

    const stored = await readAsset(asset.id);
    const file = await get(`/api/${CHAT_ASSETS_SLUG}/file/${asset.filename}`, ownerToken);

    expect(stored.chat).toBe(chatId);
    expect(stored.owner).toBe(owner.id);
    expect(stored.mimeType).toBe('image/png');
    expect(file.status).toBe(200);
  });

  it('rejects saving an asset without a current chat', async () => {
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-2' },
    };

    await expect(
      saveChatAsset({ ctx, filename: 'x.txt', mimeType: 'text/plain', data: Buffer.from('x') }),
    ).rejects.toThrow('[frogbot] saveChatAsset requires chat persistence and a current chat.');
  });
});
