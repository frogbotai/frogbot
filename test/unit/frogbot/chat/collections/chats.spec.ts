import { describe, expect, it } from 'vitest';

import { defaultChatsCollection } from '../../../../../packages/frogbot/src/chat/collections/chats.js';
import type { FieldAccess } from '../../../../../packages/frogbot/src/collections/config/types.js';
import type { FieldHook } from '../../../../../packages/frogbot/src/fields/config/types.js';
import { definePiece } from '../../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const collection = defaultChatsCollection({ slug: 'chats', userSlug: 'users' });

function reqWithUser(id?: string) {
  return (id ? { user: { id } } : {}) as FrogBotRequest;
}

describe('defaultChatsCollection', () => {
  it('produces the base config shape', () => {
    expect(collection).toMatchSnapshot();
  });

  it('binds the provided slug and user relation', () => {
    const renamed = defaultChatsCollection({ slug: 'conversations', userSlug: 'members' });
    expect(renamed.slug).toBe('conversations');
    const user = renamed.fields.find((f) => 'name' in f && f.name === 'user');
    expect(user).toMatchObject({ type: 'relationship', relationTo: 'members', index: true });
  });

  it('defines chat and external conversation fields', () => {
    const names = collection.fields.map((f) => ('name' in f ? f.name : undefined));
    expect(names).toEqual([
      'title',
      'user',
      'agent',
      'channel',
      'externalId',
      'channelKey',
      'channelThread',
      'channelLabel',
      'lastMessageAt',
      'todos',
    ]);
    expect(collection.fields.find((f) => 'name' in f && f.name === 'channelKey')).toMatchObject({
      type: 'text',
      unique: true,
      admin: { hidden: true },
    });
    expect(collection.fields.find((f) => 'name' in f && f.name === 'channel')).toMatchObject({
      admin: {
        components: { Cell: '@frogbotai/next/client#FieldCell' },
        custom: { frogbot: { kind: { type: 'channel' } } },
      },
    });
    expect(collection.fields.find((f) => 'name' in f && f.name === 'todos')).toMatchObject({
      type: 'json',
    });
  });

  it('stores the channel thread reference as hidden, typed JSON', () => {
    const channelThread = collection.fields.find(
      (f) => 'name' in f && f.name === 'channelThread',
    ) as { typescriptSchema?: Array<(args: { jsonSchema: object }) => object> };

    expect(channelThread).toMatchObject({ type: 'json', admin: { hidden: true } });
    expect(channelThread.typescriptSchema?.[0]({ jsonSchema: {} })).toEqual({
      tsType: "import('frogbot').ChannelThreadReference",
    });
  });

  it.each(['channel', 'externalId', 'channelKey', 'channelThread', 'channelLabel'])(
    'keeps the %s field read-only through the API',
    async (name) => {
      const access = (
        collection.fields.find((f) => 'name' in f && f.name === name) as {
          access?: { create?: FieldAccess; update?: FieldAccess };
        }
      ).access;

      expect(await access?.create?.({ req: reqWithUser('u1') } as never)).toBe(false);
      expect(await access?.update?.({ req: reqWithUser('u1') } as never)).toBe(false);
    },
  );

  describe('channelLabel', () => {
    const channelLabel = collection.fields.find(
      (f) => 'name' in f && f.name === 'channelLabel',
    ) as { hooks?: { afterRead?: Array<(args: unknown) => unknown> } };

    const req = {
      frogbot: {
        config: {
          pieces: {
            instances: [
              definePiece({ slug: 'slack', label: 'Slack', actions: [] })({
                slug: 'slack-support',
              }),
            ],
          },
        },
      },
    } as unknown as FrogBotRequest;

    function read(siblingData: Record<string, unknown>) {
      return channelLabel.hooks?.afterRead?.[0]?.({ req, siblingData });
    }

    it('is a hidden virtual text field', () => {
      expect(channelLabel).toMatchObject({ type: 'text', virtual: true, admin: { hidden: true } });
    });

    it('reads the piece label for a channel chat', () => {
      expect(
        read({
          channel: 'slack',
          channelKey: 'channel-key',
          channelThread: { account: 'slack-support', thread: { id: 'thread-1' } },
        }),
      ).toBe('Slack');
    });

    it('reads null for a web chat', () => {
      expect(read({ user: 'u1' })).toBeNull();
    });
  });

  it('enables soft delete and lists chats ungrouped in the admin', () => {
    expect(collection.trash).toBe(true);
    expect(collection.admin).toMatchObject({ useAsTitle: 'title' });
    expect(collection.admin).not.toHaveProperty('group');
  });

  describe('access', () => {
    it('create requires an authenticated user', async () => {
      expect(await collection.access?.create?.({ req: reqWithUser('u1') })).toBe(true);
      expect(await collection.access?.create?.({ req: reqWithUser() })).toBe(false);
    });

    it('read/update/delete are owner-scoped where queries', async () => {
      for (const op of ['read', 'update', 'delete'] as const) {
        expect(await collection.access?.[op]?.({ req: reqWithUser('u1') })).toEqual({
          user: { equals: 'u1' },
        });
        expect(await collection.access?.[op]?.({ req: reqWithUser() })).toBe(false);
      }
    });

    it('permits per-operation access overrides', async () => {
      const read = () => true as const;
      const configured = defaultChatsCollection({
        slug: 'chats',
        userSlug: 'users',
        access: { read },
      });
      expect(configured.access?.read).toBe(read);
      expect(await configured.access?.update?.({ req: reqWithUser('u1') })).toEqual({
        user: { equals: 'u1' },
      });
    });
  });

  describe('user field beforeChange', () => {
    const userField = collection.fields.find((f) => 'name' in f && f.name === 'user');
    const hook = (userField as { hooks?: { beforeChange?: FieldHook[] } }).hooks?.beforeChange?.[0];

    it('defaults to req.user.id when no value is provided', async () => {
      expect(await hook?.({ req: reqWithUser('u1'), value: undefined } as never)).toBe('u1');
    });

    it('keeps an explicit value', async () => {
      expect(await hook?.({ req: reqWithUser('u1'), value: 'u2' } as never)).toBe('u2');
    });
  });
});
