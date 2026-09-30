import { describe, expect, it } from 'vitest';

import { defaultMessagesCollection } from '../../../../../packages/frogbot/src/chat/collections/messages.js';
import type { FieldAccess } from '../../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const collection = defaultMessagesCollection({ slug: 'messages', chatsSlug: 'chats' });

function reqWithUser(id?: string, context: FrogBotRequest['context'] = {}) {
  return { context, ...(id ? { user: { id } } : {}) } as FrogBotRequest;
}

function reqWithChat(
  chat: Record<string, unknown> | null,
  context: FrogBotRequest['context'] = {},
) {
  return {
    ...reqWithUser('u1', context),
    frogbot: { findByID: async () => chat, config: { pieces: { instances: [] } } },
  } as unknown as FrogBotRequest;
}

const channelChat = {
  id: 'chat-1',
  user: 'u1',
  channel: 'slack',
  channelKey: 'channel-key',
  channelThread: { account: 'slack-support', thread: { id: 'thread-1' } },
};

const channelContext = {
  channel: { piece: 'slack', threadId: 'thread-1', author: { id: 'U1' } },
};

function field(name: string) {
  return collection.fields.find((f) => 'name' in f && f.name === name);
}

describe('defaultMessagesCollection', () => {
  it('produces the base config shape', () => {
    expect(collection).toMatchSnapshot();
  });

  it('binds the provided slug and chat relation', () => {
    const renamed = defaultMessagesCollection({ slug: 'turns', chatsSlug: 'conversations' });
    expect(renamed.slug).toBe('turns');
    const chat = renamed.fields.find((f) => 'name' in f && f.name === 'chat');
    expect(chat).toMatchObject({
      type: 'relationship',
      relationTo: 'conversations',
      required: true,
      index: true,
    });
  });

  it('defines message, turn coordination, and usage fields', () => {
    const names = collection.fields.map((f) => ('name' in f ? f.name : undefined));

    expect(names).toEqual([
      'id',
      'chat',
      'role',
      'parts',
      'metadata',
      'status',
      'delivery',
      'model',
      'reasoning',
      'author',
      'settlements',
      'version',
      'usage',
    ]);
  });

  it('defaults messages to an indexed active status and a zero version', () => {
    expect(field('status')).toMatchObject({
      type: 'select',
      options: ['active', 'queued'],
      defaultValue: 'active',
      index: true,
    });
    expect(field('delivery')).toMatchObject({ type: 'select', options: ['queue', 'steer'] });
    expect(field('version')).toMatchObject({
      type: 'number',
      defaultValue: 0,
      admin: { hidden: true },
    });
  });

  it('types author and settlements as turn coordinator shapes', () => {
    const schema = (name: string) =>
      (
        field(name) as { typescriptSchema?: Array<(args: { jsonSchema: object }) => object> }
      ).typescriptSchema?.[0]({ jsonSchema: {} });

    expect(schema('author')).toEqual({ tsType: "import('frogbot').TurnActor" });
    expect(schema('settlements')).toEqual({
      tsType: "Record<string, import('frogbot').ClientToolSettlement>",
    });
    expect(field('settlements')).toMatchObject({ type: 'json', admin: { hidden: true } });
  });

  it.each(['status', 'delivery', 'model', 'reasoning', 'author', 'settlements', 'version'])(
    'blocks direct writes to the %s field',
    async (name) => {
      const access = (field(name) as { access?: { create?: FieldAccess; update?: FieldAccess } })
        .access;

      expect(await access?.create?.({ req: reqWithUser('u1') } as never)).toBe(false);
      expect(await access?.update?.({ req: reqWithUser('u1') } as never)).toBe(false);
    },
  );

  it('types parts as UIMessage parts via typescriptSchema', () => {
    const parts = collection.fields.find((f) => 'name' in f && f.name === 'parts') as {
      typescriptSchema?: Array<(args: { jsonSchema: object }) => object>;
    };
    expect(parts.typescriptSchema?.[0]({ jsonSchema: {} })).toEqual({
      tsType: "import('frogbot').UIMessage['parts']",
    });
  });

  it('enables soft delete and lists messages ungrouped in the admin', () => {
    expect(collection.trash).toBe(true);
    expect(collection.admin).not.toHaveProperty('group');
  });

  it('hides the collection from the admin by default', () => {
    expect(collection.admin).toMatchObject({ hidden: true, icon: 'bubble-chat' });
  });

  it('blocks direct writes to the usage group', async () => {
    const usage = collection.fields.find((f) => 'name' in f && f.name === 'usage') as {
      access?: { create?: FieldAccess; update?: FieldAccess };
    };
    expect(await usage.access?.create?.({ req: reqWithUser('u1') } as never)).toBe(false);
    expect(await usage.access?.update?.({ req: reqWithUser('u1') } as never)).toBe(false);
  });

  it('writes framework usage from hook context', async () => {
    const hook = collection.hooks?.beforeChange?.[0];
    const usage = { totalTokens: 3 };
    const data = await hook?.({
      data: { role: 'assistant' },
      context: { frogbotMessageUsage: usage },
      originalDoc: { usage: { totalTokens: 2 } },
    } as never);

    expect(data).toMatchObject({ usage: { totalTokens: 5 } });
  });

  describe('access', () => {
    it('create requires an authenticated user', async () => {
      expect(await collection.access?.create?.({ req: reqWithUser('u1') })).toBe(true);
      expect(await collection.access?.create?.({ req: reqWithUser() })).toBe(false);
    });

    it.each([
      ['allows', 'the caller’s own web chat', { id: 'chat-1', user: 'u1' }, {}],
      ['refuses', 'another user’s web chat', { id: 'chat-1', user: 'u2' }, {}],
      ['refuses', 'a channel chat from outside its channel', channelChat, {}],
      ['allows', 'a channel chat from its own channel thread', channelChat, channelContext],
      ['refuses', 'a missing chat', null, {}],
    ])('create %s a message into %s', async (verdict, _, chat, context) => {
      const req = reqWithChat(chat, context);

      expect(await collection.access?.create?.({ req, data: { chat: 'chat-1' } })).toBe(
        verdict === 'allows',
      );
    });

    it('read resolves ownership through the chat relation', async () => {
      expect(await collection.access?.read?.({ req: reqWithUser('u1') })).toEqual({
        'chat.user': { equals: 'u1' },
      });
      expect(await collection.access?.read?.({ req: reqWithUser() })).toBe(false);
    });

    it('update/delete are limited to the caller’s web chats', async () => {
      for (const op of ['update', 'delete'] as const) {
        expect(await collection.access?.[op]?.({ req: reqWithUser('u1') })).toEqual({
          'chat.user': { equals: 'u1' },
          'chat.channelKey': { exists: false },
        });
        expect(await collection.access?.[op]?.({ req: reqWithUser() })).toBe(false);
        expect(await collection.access?.[op]?.({ req: reqWithUser('u1', channelContext) })).toBe(
          false,
        );
      }
    });

    it('blocks moving a message to another chat', async () => {
      const access = (field('chat') as { access?: { update?: FieldAccess } }).access;

      expect(await access?.update?.({ req: reqWithUser('u1') } as never)).toBe(false);
    });

    it('permits per-operation access overrides', async () => {
      const read = () => true as const;
      const configured = defaultMessagesCollection({
        slug: 'messages',
        chatsSlug: 'chats',
        access: { read },
      });
      expect(configured.access?.read).toBe(read);
      expect(await configured.access?.update?.({ req: reqWithUser('u1') })).toEqual({
        'chat.user': { equals: 'u1' },
        'chat.channelKey': { exists: false },
      });
    });
  });
});
