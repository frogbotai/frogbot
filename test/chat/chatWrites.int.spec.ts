import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrogBotRequest } from 'frogbot';
import { definePiece } from 'frogbot';
import { runQueuedTurn, settleClientToolCall } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import type { StubChatModel } from '../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../__helpers/shared/StubChatModel';
import { chatsSlug, messagesSlug, modelPort, questionAgentSlug, usersSlug } from './shared.js';

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

const answer = { answers: [{ header: 'Color', selected: ['Blue'] }] };

const slackSupport = definePiece({ slug: 'slack', label: 'Slack', actions: [] })({
  slug: 'slack-support',
});

const channelRefusal = {
  code: 'channel-chat',
  error: expect.stringContaining('This conversation happens in Slack.'),
};

type User = { id: number | string; headers: Record<string, string> };

type Chat = { id: number | string };

type StoredMessage = {
  id: string;
  role: string;
  chat: number | string;
  parts: Array<{ type: string; text?: string; state?: string }>;
};

type StoredChat = {
  title?: string | null;
  channelLabel?: string | null;
  channel?: string | null;
  externalId?: string | null;
  channelKey?: string | null;
  channelThread?: unknown;
};

describe('chat writes: a chat is written only from its home', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let owner: User;
  let stranger: User;
  let sequence = 0;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'chat-writes');
    booted.frogbot.config.pieces.instances.push(slackSupport);
    owner = await signUp('owner@chat-writes.test');
    stranger = await signUp('stranger@chat-writes.test');
  });

  afterEach(() => {
    model.reset();
  });

  afterAll(async () => {
    booted.frogbot.config.pieces.instances.splice(
      booted.frogbot.config.pieces.instances.indexOf(slackSupport),
      1,
    );

    await booted.shutdown();
    await model.close();
  });

  async function request(
    method: string,
    route: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${booted.baseUrl}/api${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();

    return {
      status: response.status,
      body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
    };
  }

  async function signUp(email: string): Promise<User> {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-int-password' },
      overrideAccess: true,
    });

    const login = await request('POST', `/${usersSlug}/login`, {
      email,
      password: 'frogbot-int-password',
    });

    return { id: user.id, headers: { Authorization: `JWT ${login.body.token as string}` } };
  }

  function nextThreadId(): string {
    sequence += 1;

    return `slack:C-writes:${sequence}`;
  }

  async function createChannelChat(threadId: string): Promise<Chat> {
    return booted.frogbot.create({
      collection: chatsSlug,
      data: {
        user: owner.id,
        agent: questionAgentSlug,
        channel: 'slack',
        externalId: threadId,
        channelKey: `chat-writes-${threadId}`,
        channelThread: {
          account: 'slack-support',
          thread: { _type: 'chat:Thread', id: threadId, channelId: 'C-writes', isDM: false },
        },
      },
      overrideAccess: true,
    });
  }

  async function createWebChat(user: User = owner): Promise<Chat> {
    return booted.frogbot.create({
      collection: chatsSlug,
      data: { user: user.id, agent: questionAgentSlug },
      overrideAccess: true,
    });
  }

  async function channelRequest(threadId: string): Promise<FrogBotRequest> {
    const user = await booted.frogbot.findByID({
      collection: usersSlug,
      id: owner.id,
      depth: 0,
      overrideAccess: true,
    });

    return booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
      context: {
        channel: { piece: 'slack', threadId, author: { id: 'U-owner', name: 'Owner' } },
      },
    } as Partial<FrogBotRequest>);
  }

  async function webRequest(): Promise<FrogBotRequest> {
    const user = await booted.frogbot.findByID({
      collection: usersSlug,
      id: owner.id,
      depth: 0,
      overrideAccess: true,
    });

    return booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
    } as Partial<FrogBotRequest>);
  }

  async function sendAs(req: FrogBotRequest, chat: Chat, prompt = 'Paint the fence.') {
    const result = await booted.frogbot.agents[questionAgentSlug]!.streamMessage({
      req,
      chatId: chat.id,
      prompt,
      clientTools: { kinds: ['question'] },
    });

    if (!('persistence' in result)) throw new Error('Expected the turn to start.');

    await result.consumeStream();
    await result.persistence;
  }

  async function askInChannel(threadId: string): Promise<Chat> {
    const chat = await createChannelChat(threadId);

    model.respond({ toolCalls: [{ id: 'call-question', name: 'question', input: questionInput }] });

    await sendAs(await channelRequest(threadId), chat);

    model.reset();

    return chat;
  }

  async function storedMessages(chat: Chat): Promise<StoredMessage[]> {
    const result = await booted.frogbot.find({
      collection: messagesSlug,
      where: { chat: { equals: chat.id } },
      sort: ['createdAt', 'id'],
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    return result.docs as unknown as StoredMessage[];
  }

  async function storedChat(chat: Chat): Promise<StoredChat> {
    return (await booted.frogbot.findByID({
      collection: chatsSlug,
      id: chat.id,
      depth: 0,
      overrideAccess: true,
    })) as StoredChat;
  }

  async function pending(chat: Chat): Promise<number> {
    const response = await request(
      'GET',
      `/agents/${questionAgentSlug}/chats/${chat.id}/pending`,
      undefined,
      owner.headers,
    );

    return (response.body.pending as unknown[]).length;
  }

  function restMessage(chat: Chat, id: string) {
    return { id, chat: chat.id, role: 'user', parts: [{ type: 'text', text: 'Injected.' }] };
  }

  describe('web and HTTP writes into a channel chat', () => {
    it('POST /api/agents/:slug refuses a web send into a channel chat and names the channel', async () => {
      const chat = await createChannelChat(nextThreadId());

      const response = await request(
        'POST',
        `/agents/${questionAgentSlug}`,
        { chatId: chat.id, prompt: 'Hello from the web.' },
        owner.headers,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(channelRefusal);
      expect(await storedMessages(chat)).toEqual([]);
      expect(model.requests).toHaveLength(0);
    });

    it('POST /api/agents/:slug/chats/:chatId/settle refuses a web answer to a channel question', async () => {
      const chat = await askInChannel(nextThreadId());

      const response = await request(
        'POST',
        `/agents/${questionAgentSlug}/chats/${chat.id}/settle`,
        { toolCallId: 'call-question', output: answer },
        owner.headers,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(channelRefusal);
      expect(await pending(chat)).toBe(1);
      expect(model.requests).toHaveLength(0);
    });

    it('POST /api/agents/:slug/chats/:chatId/settle refuses a web dismissal of a channel question', async () => {
      const chat = await askInChannel(nextThreadId());

      const response = await request(
        'POST',
        `/agents/${questionAgentSlug}/chats/${chat.id}/settle`,
        { toolCallId: 'call-question', dismissed: true },
        owner.headers,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(channelRefusal);
      expect(await pending(chat)).toBe(1);
    });

    it('POST /api/agents/:slug refuses a tool output submitted through the chat stream', async () => {
      const chat = await askInChannel(nextThreadId());
      const [, assistant] = await storedMessages(chat);

      const response = await request(
        'POST',
        `/agents/${questionAgentSlug}`,
        {
          chatId: chat.id,
          messages: [
            {
              ...assistant,
              parts: assistant!.parts.map((part) =>
                part.type === 'tool-question'
                  ? { ...part, state: 'output-available', output: answer }
                  : part,
              ),
            },
          ],
        },
        owner.headers,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(channelRefusal);
      expect(await pending(chat)).toBe(1);
      expect(model.requests).toHaveLength(0);
    });

    it('POST /api/agents/:slug ignores a channel context forged in the query string', async () => {
      const threadId = nextThreadId();
      const chat = await createChannelChat(threadId);
      const forged = new URLSearchParams({
        'context[channel][piece]': 'slack',
        'context[channel][threadId]': threadId,
        'context[channel][author][id]': 'U-forged',
      });

      const response = await request(
        'POST',
        `/agents/${questionAgentSlug}?${forged}`,
        { chatId: chat.id, prompt: 'Forged.' },
        owner.headers,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject(channelRefusal);
      expect(await storedMessages(chat)).toEqual([]);
    });
  });

  describe('programmatic writes into a channel chat', () => {
    it('a request from the chat’s own channel thread sends and answers', async () => {
      const threadId = nextThreadId();
      const chat = await askInChannel(threadId);

      const settlement = await settleClientToolCall({
        req: await channelRequest(threadId),
        chatId: chat.id,
        toolCallId: 'call-question',
        outcome: { output: answer },
      });

      expect(settlement).toMatchObject({ status: 'settled', allSettled: true });
      expect((await storedMessages(chat)).map(({ role }) => role)).toEqual(['user', 'assistant']);
    });

    it('a request from another thread of the same channel is refused', async () => {
      const chat = await createChannelChat(nextThreadId());

      await expect(sendAs(await channelRequest(nextThreadId()), chat)).rejects.toMatchObject({
        code: 'channel-chat',
        status: 409,
      });

      expect(await storedMessages(chat)).toEqual([]);
    });

    it('a request without channel context is refused even for the chat owner', async () => {
      const chat = await createChannelChat(nextThreadId());

      await expect(sendAs(await webRequest(), chat)).rejects.toMatchObject({
        code: 'channel-chat',
        status: 409,
      });

      expect(await storedMessages(chat)).toEqual([]);
    });

    it('settleClientToolCall without channel context is refused', async () => {
      const chat = await askInChannel(nextThreadId());

      await expect(
        settleClientToolCall({
          req: await webRequest(),
          chatId: chat.id,
          toolCallId: 'call-question',
          outcome: { output: answer },
        }),
      ).rejects.toMatchObject({ code: 'channel-chat', status: 409 });

      expect(await pending(chat)).toBe(1);
    });
  });

  describe('queued promotion', () => {
    async function queue(chat: Chat, author: Record<string, unknown>) {
      await booted.frogbot.create({
        collection: messagesSlug,
        data: {
          id: `queued-${chat.id}`,
          chat: chat.id,
          role: 'user',
          parts: [{ type: 'text', text: 'Queued.' }],
          status: 'queued',
          delivery: 'queue',
          author,
        },
        overrideAccess: true,
      });
    }

    it('a web-authored message queued in a channel chat is discarded instead of run', async () => {
      const chat = await createChannelChat(nextThreadId());

      await queue(chat, { user: { collection: usersSlug, id: owner.id } });
      await runQueuedTurn({ frogbot: booted.frogbot, chatId: chat.id });

      expect(model.requests).toHaveLength(0);
      expect(await storedMessages(chat)).toEqual([]);
    });

    it('a channel-authored message queued in its channel chat runs', async () => {
      const chat = await createChannelChat(nextThreadId());

      model.respond({ text: 'On it.' });

      await queue(chat, {
        user: { collection: usersSlug, id: owner.id },
        channel: { piece: 'slack', id: 'U-owner' },
      });
      await runQueuedTurn({ frogbot: booted.frogbot, chatId: chat.id });

      await expect
        .poll(async () => (await storedMessages(chat)).map(({ role }) => role))
        .toEqual(['user', 'assistant']);
      expect(model.requests).toHaveLength(1);
    });
  });

  describe('REST message writes', () => {
    it('POST /api/messages refuses a message into a channel chat', async () => {
      const chat = await createChannelChat(nextThreadId());

      const response = await request(
        'POST',
        `/${messagesSlug}`,
        restMessage(chat, 'rest-channel'),
        owner.headers,
      );

      expect(response.status).toBe(403);
      expect(await storedMessages(chat)).toEqual([]);
    });

    it('POST /api/messages ignores a channel context forged in the query string', async () => {
      const threadId = nextThreadId();
      const chat = await createChannelChat(threadId);
      const forged = new URLSearchParams({
        'context[channel][piece]': 'slack',
        'context[channel][threadId]': threadId,
        'context[channel][author][id]': 'U-forged',
      });

      const response = await request(
        'POST',
        `/${messagesSlug}?${forged}`,
        restMessage(chat, 'rest-forged'),
        owner.headers,
      );

      expect(response.status).toBe(403);
      expect(await storedMessages(chat)).toEqual([]);
    });

    it('POST /api/messages refuses a message into another user’s chat', async () => {
      const chat = await createWebChat(owner);

      const response = await request(
        'POST',
        `/${messagesSlug}`,
        restMessage(chat, 'rest-cross-user'),
        stranger.headers,
      );

      expect(response.status).toBe(403);
      expect(await storedMessages(chat)).toEqual([]);
    });

    it('POST /api/messages still writes into the caller’s own web chat', async () => {
      const chat = await createWebChat(owner);

      const response = await request(
        'POST',
        `/${messagesSlug}`,
        restMessage(chat, 'rest-own'),
        owner.headers,
      );

      expect(response.status).toBe(201);
      expect((await storedMessages(chat)).map(({ id }) => id)).toEqual(['rest-own']);
    });

    it('PATCH /api/messages/:id refuses to edit a channel chat message', async () => {
      const chat = await askInChannel(nextThreadId());
      const [message] = await storedMessages(chat);

      const response = await request(
        'PATCH',
        `/${messagesSlug}/${message!.id}`,
        { parts: [{ type: 'text', text: 'Edited from the web.' }] },
        owner.headers,
      );

      expect(response.status).toBe(403);
      expect((await storedMessages(chat))[0]!.parts).toEqual(message!.parts);
    });

    it('DELETE /api/messages/:id refuses to delete a channel chat message', async () => {
      const chat = await askInChannel(nextThreadId());
      const [message] = await storedMessages(chat);

      const response = await request(
        'DELETE',
        `/${messagesSlug}/${message!.id}`,
        undefined,
        owner.headers,
      );

      expect(response.status).toBe(403);
      expect(await storedMessages(chat)).toHaveLength(2);
    });

    it('PATCH /api/messages/:id cannot move a message into a channel chat', async () => {
      const web = await createWebChat(owner);
      const channel = await createChannelChat(nextThreadId());

      await request('POST', `/${messagesSlug}`, restMessage(web, 'rest-move'), owner.headers);

      const response = await request(
        'PATCH',
        `/${messagesSlug}/rest-move`,
        { chat: channel.id },
        owner.headers,
      );

      expect(response.status).toBe(200);
      expect((await storedMessages(web)).map(({ id }) => id)).toEqual(['rest-move']);
      expect(await storedMessages(channel)).toEqual([]);
    });
  });

  describe('REST message reads while Messages is hidden in the admin', () => {
    it('registers the default messages collection as hidden in the admin', () => {
      const collection = booted.payload.config.collections.find(
        ({ slug }) => slug === messagesSlug,
      );

      expect(collection?.admin?.hidden).toBe(true);
    });

    it('GET /api/messages returns the caller’s messages while Messages is hidden in the admin', async () => {
      const chat = await createWebChat(owner);

      await request('POST', `/${messagesSlug}`, restMessage(chat, 'rest-read'), owner.headers);

      const response = await request(
        'GET',
        `/${messagesSlug}?where[chat][equals]=${chat.id}`,
        undefined,
        owner.headers,
      );

      expect(response.status).toBe(200);
      expect((response.body.docs as StoredMessage[]).map(({ id }) => id)).toEqual(['rest-read']);
    });

    it('GET /api/messages returns no messages from another user’s chat', async () => {
      const chat = await createWebChat(owner);

      await request('POST', `/${messagesSlug}`, restMessage(chat, 'rest-private'), owner.headers);

      const response = await request(
        'GET',
        `/${messagesSlug}?where[chat][equals]=${chat.id}`,
        undefined,
        stranger.headers,
      );

      expect(response.status).toBe(200);
      expect(response.body.docs).toEqual([]);
    });
  });

  describe('REST chat writes', () => {
    it('PATCH /api/chats/:id keeps channel fields read-only while other fields stay editable', async () => {
      const threadId = nextThreadId();
      const chat = await createChannelChat(threadId);
      const before = await storedChat(chat);

      const response = await request(
        'PATCH',
        `/${chatsSlug}/${chat.id}`,
        {
          title: 'Renamed',
          channel: 'web',
          externalId: 'detached',
          channelKey: 'detached',
          channelThread: null,
        },
        owner.headers,
      );

      expect(response.status).toBe(200);
      expect(await storedChat(chat)).toMatchObject({
        title: 'Renamed',
        channel: before.channel,
        externalId: before.externalId,
        channelKey: before.channelKey,
        channelThread: before.channelThread,
      });
    });

    it('POST /api/chats cannot claim a channel conversation', async () => {
      const threadId = nextThreadId();

      const response = await request(
        'POST',
        `/${chatsSlug}`,
        {
          agent: questionAgentSlug,
          channel: 'slack',
          externalId: threadId,
          channelKey: `claimed-${threadId}`,
          channelThread: { account: 'slack-support', thread: { id: threadId } },
        },
        owner.headers,
      );

      expect(response.status).toBe(201);
      expect(await storedChat(response.body.doc as Chat)).toMatchObject({
        channel: null,
        externalId: null,
        channelKey: null,
        channelThread: null,
      });
    });
  });

  describe('channel label', () => {
    async function restChat(chat: Chat): Promise<StoredChat> {
      const response = await request('GET', `/${chatsSlug}/${chat.id}`, undefined, owner.headers);

      return response.body as StoredChat;
    }

    it('GET /api/chats/:id reads the channel’s display name for a channel chat', async () => {
      const chat = await createChannelChat(nextThreadId());

      expect((await restChat(chat)).channelLabel).toBe('Slack');
    });

    it('the Local API reads the channel’s display name for a channel chat', async () => {
      const chat = await createChannelChat(nextThreadId());

      expect((await storedChat(chat)).channelLabel).toBe('Slack');
    });

    it('a web chat reads a null channel label over REST and the Local API', async () => {
      const chat = await createWebChat(owner);

      expect((await restChat(chat)).channelLabel).toBeNull();
      expect((await storedChat(chat)).channelLabel).toBeNull();
    });

    it('PATCH /api/chats/:id cannot write the channel label', async () => {
      const web = await createWebChat(owner);
      const channel = await createChannelChat(nextThreadId());

      await request('PATCH', `/${chatsSlug}/${web.id}`, { channelLabel: 'Forged' }, owner.headers);
      await request(
        'PATCH',
        `/${chatsSlug}/${channel.id}`,
        { channelLabel: 'Forged' },
        owner.headers,
      );

      expect((await restChat(web)).channelLabel).toBeNull();
      expect((await restChat(channel)).channelLabel).toBe('Slack');
    });

    it('POST /api/chats cannot write the channel label', async () => {
      const response = await request(
        'POST',
        `/${chatsSlug}`,
        { agent: questionAgentSlug, channelLabel: 'Forged' },
        owner.headers,
      );

      expect(response.status).toBe(201);
      expect((await storedChat(response.body.doc as Chat)).channelLabel).toBeNull();
    });
  });
});
