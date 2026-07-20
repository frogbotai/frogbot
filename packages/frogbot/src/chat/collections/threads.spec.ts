import { describe, expect, it } from 'vitest';

import type { FieldHook } from '../../types/fields.js';
import type { FrogbotRequest } from '../../types/request.js';
import { defaultThreadsCollection } from './threads.js';

const collection = defaultThreadsCollection({ slug: 'threads', userSlug: 'users' });

function reqWithUser(id?: string) {
  return (id ? { user: { id } } : {}) as FrogbotRequest;
}

describe('defaultThreadsCollection', () => {
  it('produces the base config shape', () => {
    expect(collection).toMatchSnapshot();
  });

  it('binds the provided slug and user relation', () => {
    const renamed = defaultThreadsCollection({ slug: 'conversations', userSlug: 'members' });
    expect(renamed.slug).toBe('conversations');
    const user = renamed.fields.find((f) => 'name' in f && f.name === 'user');
    expect(user).toMatchObject({ type: 'relationship', relationTo: 'members', index: true });
  });

  it('defines title, user, agent, and lastMessageAt fields', () => {
    const names = collection.fields.map((f) => ('name' in f ? f.name : undefined));
    expect(names).toEqual(['title', 'user', 'agent', 'lastMessageAt']);
  });

  it('enables soft delete and the Chat admin group', () => {
    expect(collection.trash).toBe(true);
    expect(collection.admin).toMatchObject({ group: 'Chat', useAsTitle: 'title' });
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
