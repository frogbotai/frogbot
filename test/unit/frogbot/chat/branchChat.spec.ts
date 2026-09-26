import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BasePayload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import { canWriteChat } from '../../../../packages/frogbot/src/chat/access/canWriteChat.js';
import { branchChat } from '../../../../packages/frogbot/src/chat/branchChat.js';
import { CHAT_TURNS_SLUG } from '../../../../packages/frogbot/src/chat/collections/turns.js';
import type { ChatDocument } from '../../../../packages/frogbot/src/chat/findChat.js';
import { INTERRUPTED_TOOL_ERROR } from '../../../../packages/frogbot/src/chat/turn/messages.js';
import { findTurnState } from '../../../../packages/frogbot/src/chat/turn/state.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { type FrogBot, initFrogBotFromPayload } from '../../../../packages/frogbot/src/frogbot.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const question = {
  type: 'tool-question',
  toolCallId: 'call-1',
  state: 'input-available',
  input: {
    questions: [
      {
        header: 'Target',
        question: 'Where should this deploy?',
        options: [{ label: 'Staging' }, { label: 'Production' }],
      },
    ],
  },
};

const channelThread = {
  account: 'slack-support',
  thread: { _type: 'chat:Thread', id: 'slack:C1:1.000001', channelId: 'slack:C1' },
};

type BranchSource = {
  chat: ChatDocument;
  messageId: string;
};

type StoredMessage = {
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
};

describe('branchChat on a channel conversation', () => {
  let directory: string;
  let frogbot: FrogBot;
  let owner: FrogBotRequest;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-branch-chat-'));

    const config = await buildConfig({
      secret: 'branch-chat-test-secret',
      db: sqliteAdapter({ client: { url: `file:${directory}/branch.db` }, push: true }),
      typescript: { autoGenerate: false },
      admin: { importMap: { autoGenerate: false } },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'chats', chat: true, fields: [] },
      ],
    });

    const payload = await new BasePayload().init({
      config: config._internal.payloadConfig,
      disableOnInit: true,
    });

    frogbot = await initFrogBotFromPayload(payload, config, { disableOnInit: true });

    const user = await frogbot.create({
      collection: 'users',
      data: { email: 'owner@example.com', password: 'branch-chat-password' },
      overrideAccess: true,
    });

    owner = await frogbot.createRequest({ user: { ...user, collection: 'users' } } as never);
  }, 30_000);

  afterAll(async () => {
    await frogbot?.destroy();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function awaitingChannelChat(): Promise<BranchSource> {
    const chat = (await frogbot.create({
      collection: 'chats',
      data: {
        title: 'Deploy thread',
        user: owner.user!.id,
        agent: 'support',
        channel: 'slack',
        externalId: '1.000001',
        channelKey: `slack:${Math.random()}`,
        channelThread,
      },
      overrideAccess: true,
    })) as unknown as ChatDocument;

    await frogbot.create({
      collection: 'messages',
      data: {
        id: `user-${chat.id}`,
        chat: chat.id,
        role: 'user',
        parts: [{ type: 'text', text: 'Deploy it' }],
      },
      overrideAccess: true,
    });

    const assistant = await frogbot.create({
      collection: 'messages',
      data: {
        id: `assistant-${chat.id}`,
        chat: chat.id,
        role: 'assistant',
        parts: [{ type: 'step-start' }, question],
      },
      overrideAccess: true,
    });

    await frogbot.create({
      collection: CHAT_TURNS_SLUG,
      data: { id: String(chat.id), state: 'awaiting' },
      overrideAccess: true,
    });

    return { chat, messageId: String(assistant.id) };
  }

  async function messagesOf(chatId: ChatDocument['id']): Promise<StoredMessage[]> {
    const result = await frogbot.find({
      collection: 'messages',
      where: { chat: { equals: chatId } },
      sort: ['createdAt', 'id'],
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    return result.docs as unknown as StoredMessage[];
  }

  async function chatOf(chatId: ChatDocument['id']): Promise<ChatDocument> {
    return (await frogbot.findByID({
      collection: 'chats',
      id: chatId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as ChatDocument;
  }

  it('closes the pending question in the branch', async () => {
    const source = await awaitingChannelChat();

    const { chatId } = await branchChat({
      req: owner,
      chatId: source.chat.id,
      messageId: source.messageId,
    });

    const messages = await messagesOf(chatId);

    expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.parts).toEqual([
      { type: 'step-start' },
      { ...question, state: 'output-error', errorText: INTERRUPTED_TOOL_ERROR },
    ]);
  });

  it('starts the branch as an idle web chat its owner can write', async () => {
    const source = await awaitingChannelChat();

    const { chatId } = await branchChat({
      req: owner,
      chatId: source.chat.id,
      messageId: source.messageId,
    });

    const branch = await chatOf(chatId);

    expect(branch).toMatchObject({ user: owner.user!.id, agent: 'support' });
    expect(branch.channel ?? null).toBeNull();
    expect(branch.channelKey ?? null).toBeNull();
    expect(branch.channelThread ?? null).toBeNull();
    expect(await findTurnState({ req: owner, chatId })).toBe('idle');
    expect(canWriteChat({ req: owner, chat: branch })).toBe(true);
  });

  it('leaves the channel conversation and its pending question untouched', async () => {
    const source = await awaitingChannelChat();

    await branchChat({ req: owner, chatId: source.chat.id, messageId: source.messageId });

    const messages = await messagesOf(source.chat.id);

    expect(messages.at(-1)!.parts).toEqual([{ type: 'step-start' }, question]);
    expect(await findTurnState({ req: owner, chatId: source.chat.id })).toBe('awaiting');
    expect(canWriteChat({ req: owner, chat: await chatOf(source.chat.id) })).toBe(false);
  });
});
