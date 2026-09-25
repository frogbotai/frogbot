import { describe, expect, it } from 'vitest';

import { defaultMessagesCollection } from '../../../../../packages/frogbot/src/chat/collections/messages.js';
import type { FieldAccess } from '../../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const collection = defaultMessagesCollection({ slug: 'messages', chatsSlug: 'chats' });

function reqWithUser(id?: string) {
  return (id ? { user: { id } } : {}) as FrogBotRequest;
}

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

  it.each(['status', 'delivery', 'author', 'settlements', 'version'])(
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

  it('enables soft delete and the Chat admin group', () => {
    expect(collection.trash).toBe(true);
    expect(collection.admin).toMatchObject({ group: 'Chat' });
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

    it('read/update/delete resolve ownership through the chat relation', async () => {
      for (const op of ['read', 'update', 'delete'] as const) {
        expect(await collection.access?.[op]?.({ req: reqWithUser('u1') })).toEqual({
          'chat.user': { equals: 'u1' },
        });
        expect(await collection.access?.[op]?.({ req: reqWithUser() })).toBe(false);
      }
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
      });
    });
  });
});
