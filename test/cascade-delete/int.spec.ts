import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CollectionSlug, DocID, Where } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import {
  apiKeysSlug,
  chatsSlug,
  connectionsSlug,
  messagesSlug,
  pieceSlug,
  refuseMessageDelete,
  refuseMessageID,
  refuseUserDelete,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const database = process.env.FROGBOT_DATABASE || 'sqlite';
const transactional = database !== 'sqlite';
const password = 'frogbot-int-password';

describe(`cascade delete [${database}]`, () => {
  let booted: BootedFrogBot;
  let owner: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    owner = await signUp('owner@cascade-delete.test');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  async function signUp(email: string) {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const login = await fetch(`${booted.baseUrl}/api/${usersSlug}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const { token } = (await login.json()) as { token: string };

    return { id: user.id, headers: { Authorization: `JWT ${token}` } };
  }

  async function createChat() {
    const chat = await booted.frogbot.create({
      collection: chatsSlug,
      data: { user: owner.id },
      overrideAccess: true,
    });

    for (const id of [`${chat.id}-active`, `${chat.id}-trashed`]) {
      await booted.frogbot.create({
        collection: messagesSlug,
        data: { id, chat: chat.id, role: 'user', parts: [{ type: 'text', text: id }] },
        overrideAccess: true,
      });
    }

    await booted.frogbot.update({
      collection: messagesSlug,
      id: `${chat.id}-trashed`,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    return chat;
  }

  async function count(collection: CollectionSlug, where: Where) {
    const { totalDocs } = await booted.payload.count({
      collection,
      where,
      overrideAccess: true,
      trash: true,
    });

    return totalDocs;
  }

  function deleteChat(id: DocID, query = '') {
    return fetch(`${booted.baseUrl}/api/${chatsSlug}/${id}${query}`, {
      method: 'DELETE',
      headers: owner.headers,
    });
  }

  it('deletes active and trashed messages with their chat through the Local API', async () => {
    const chat = await createChat();

    expect(await count(messagesSlug, { chat: { equals: chat.id } })).toBe(2);

    await booted.frogbot.delete({ collection: chatsSlug, id: chat.id, overrideAccess: true });

    expect(await count(chatsSlug, { id: { equals: chat.id } })).toBe(0);
    expect(await count(messagesSlug, { chat: { equals: chat.id } })).toBe(0);
  });

  it("deletes a chat's messages over REST although message delete access is denied", async () => {
    const chat = await createChat();

    const response = await deleteChat(chat.id);

    expect(response.status).toBe(200);
    expect(await count(chatsSlug, { id: { equals: chat.id } })).toBe(0);
    expect(await count(messagesSlug, { chat: { equals: chat.id } })).toBe(0);
  });

  it("deletes a user's API keys and connections with the user", async () => {
    await booted.frogbot.create({
      collection: apiKeysSlug,
      data: { name: 'Key', owner: owner.id, prefix: 'fb_key', tokenHash: 'cascade-hash' },
      overrideAccess: true,
    });

    await booted.frogbot.create({
      collection: connectionsSlug,
      data: { owner: owner.id, piece: pieceSlug, method: 'secret', credential: 'sealed' },
      overrideAccess: true,
    });

    await booted.frogbot.delete({ collection: usersSlug, id: owner.id, overrideAccess: true });

    expect(await count(usersSlug, { id: { equals: owner.id } })).toBe(0);
    expect(await count(apiKeysSlug, { owner: { equals: owner.id } })).toBe(0);
    expect(await count(connectionsSlug, { owner: { equals: owner.id } })).toBe(0);
  });

  it('keeps messages when a chat is trashed and deletes them when it is deleted for good', async () => {
    const chat = await createChat();

    await booted.frogbot.update({
      collection: chatsSlug,
      id: chat.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    expect(await count(messagesSlug, { chat: { equals: chat.id } })).toBe(2);

    const response = await deleteChat(chat.id, '?trash=true');

    expect(response.status).toBe(200);
    expect(await count(chatsSlug, { id: { equals: chat.id } })).toBe(0);
    expect(await count(messagesSlug, { chat: { equals: chat.id } })).toBe(0);
  });

  async function refusedChatDelete() {
    const chat = await createChat();

    await booted.frogbot.create({
      collection: messagesSlug,
      data: { id: refuseMessageID, chat: chat.id, role: 'user', parts: [] },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.delete({
        collection: chatsSlug,
        id: chat.id,
        overrideAccess: true,
        context: { [refuseMessageDelete]: true },
      }),
    ).rejects.toThrow(
      `[frogbot] Could not delete ${messagesSlug} for ${chatsSlug} ${chat.id}: Message delete refused.`,
    );

    return chat;
  }

  it('fails the chat delete when a message delete fails', async () => {
    const chat = await refusedChatDelete();

    expect(await count(chatsSlug, { id: { equals: chat.id } })).toBe(1);
  });

  it.runIf(transactional)(
    'rolls back the deleted messages when a message delete fails',
    async () => {
      const chat = await refusedChatDelete();

      expect(await count(messagesSlug, { chat: { equals: chat.id } })).toBe(3);
    },
  );

  it("runs the app's beforeDelete hook before the cascade", async () => {
    await booted.frogbot.create({
      collection: apiKeysSlug,
      data: { name: 'Key', owner: owner.id, prefix: 'fb_key', tokenHash: 'refused-hash' },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.delete({
        collection: usersSlug,
        id: owner.id,
        overrideAccess: true,
        context: { [refuseUserDelete]: true },
      }),
    ).rejects.toThrow('User delete refused.');

    expect(await count(usersSlug, { id: { equals: owner.id } })).toBe(1);
    expect(await count(apiKeysSlug, { owner: { equals: owner.id } })).toBe(1);
  });
});
