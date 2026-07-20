import { describe, expect, it } from 'vitest';

import type { FieldAccess } from '../../types/access.js';
import type { FrogbotRequest } from '../../types/request.js';
import { defaultMessagesCollection } from './messages.js';

const collection = defaultMessagesCollection({ slug: 'messages', threadsSlug: 'threads' });

function reqWithUser(id?: string) {
  return (id ? { user: { id } } : {}) as FrogbotRequest;
}

describe('defaultMessagesCollection', () => {
  it('produces the base config shape', () => {
    expect(collection).toMatchSnapshot();
  });

  it('binds the provided slug and thread relation', () => {
    const renamed = defaultMessagesCollection({ slug: 'turns', threadsSlug: 'conversations' });
    expect(renamed.slug).toBe('turns');
    const thread = renamed.fields.find((f) => 'name' in f && f.name === 'thread');
    expect(thread).toMatchObject({ type: 'relationship', relationTo: 'conversations', required: true, index: true });
  });

  it('defines thread, role, parts, metadata, and usage fields', () => {
    const names = collection.fields.map((f) => ('name' in f ? f.name : undefined));
    expect(names).toEqual(['thread', 'role', 'parts', 'metadata', 'usage']);
  });

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

  describe('access', () => {
    it('create requires an authenticated user', async () => {
      expect(await collection.access?.create?.({ req: reqWithUser('u1') })).toBe(true);
      expect(await collection.access?.create?.({ req: reqWithUser() })).toBe(false);
    });

    it('read/update/delete resolve ownership through the thread relation', async () => {
      for (const op of ['read', 'update', 'delete'] as const) {
        expect(await collection.access?.[op]?.({ req: reqWithUser('u1') })).toEqual({
          'thread.user': { equals: 'u1' },
        });
        expect(await collection.access?.[op]?.({ req: reqWithUser() })).toBe(false);
      }
    });
  });
});
