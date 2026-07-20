import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../types/collection.js';
import { mergeChatCollection } from './mergeCollection.js';

const baseHook = () => 'base';
const userHook = () => 'user';

function makeBase(overrides?: Partial<CollectionConfig>): CollectionConfig {
  return {
    slug: 'threads',
    trash: true,
    admin: { group: 'Chat', useAsTitle: 'title' },
    access: {
      create: () => true,
      read: () => ({ user: { equals: 'base' } }),
    },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'agent', type: 'text', index: true },
    ],
    ...overrides,
  };
}

describe('mergeChatCollection', () => {
  it('appends base fields missing from the user collection', () => {
    const merged = mergeChatCollection({
      user: { slug: 'threads', fields: [{ name: 'department', type: 'text' }] },
      base: makeBase(),
      reservedFields: [],
    });
    expect(merged.fields.map((f) => ('name' in f ? f.name : undefined))).toEqual(['department', 'title', 'agent']);
  });

  it('deep-merges matching fields with user props winning', () => {
    const merged = mergeChatCollection({
      user: {
        slug: 'threads',
        fields: [{ name: 'title', type: 'text', label: 'Subject', admin: { readOnly: true } }],
      },
      base: makeBase({
        fields: [{ name: 'title', type: 'text', index: true, admin: { description: 'Thread title' } }],
      }),
      reservedFields: [],
    });
    expect(merged.fields[0]).toMatchObject({
      name: 'title',
      type: 'text',
      label: 'Subject',
      index: true,
      admin: { readOnly: true, description: 'Thread title' },
    });
  });

  it('concatenates field hooks — base first, then user', () => {
    const merged = mergeChatCollection({
      user: {
        slug: 'threads',
        fields: [{ name: 'title', type: 'text', hooks: { beforeChange: [userHook] } }],
      },
      base: makeBase({
        fields: [{ name: 'title', type: 'text', hooks: { beforeChange: [baseHook] } }],
      }),
      reservedFields: [],
    });
    const title = merged.fields[0] as { hooks?: { beforeChange?: unknown[] } };
    expect(title.hooks?.beforeChange).toEqual([baseHook, userHook]);
  });

  it('concatenates collection hooks — base first, then user', () => {
    const merged = mergeChatCollection({
      user: { slug: 'threads', fields: [], hooks: { afterChange: [userHook as never] } },
      base: makeBase({ hooks: { afterChange: [baseHook as never] } }),
      reservedFields: [],
    });
    expect(merged.hooks?.afterChange).toEqual([baseHook, userHook]);
  });

  it('merges group subfields recursively', () => {
    const merged = mergeChatCollection({
      user: {
        slug: 'messages',
        fields: [{ name: 'usage', type: 'group', fields: [{ name: 'costUsd', type: 'number' }] }],
      },
      base: makeBase({
        fields: [
          {
            name: 'usage',
            type: 'group',
            fields: [
              { name: 'inputTokens', type: 'number' },
              { name: 'outputTokens', type: 'number' },
            ],
          },
        ],
      }),
      reservedFields: [],
    });
    const usage = merged.fields[0] as { fields: Array<{ name?: string }> };
    expect(usage.fields.map((f) => f.name)).toEqual(['costUsd', 'inputTokens', 'outputTokens']);
  });

  it('user access keys win per-key, base fills the rest', async () => {
    const userRead = () => true as const;
    const merged = mergeChatCollection({
      user: { slug: 'threads', fields: [], access: { read: userRead } },
      base: makeBase(),
      reservedFields: [],
    });
    expect(merged.access?.read).toBe(userRead);
    expect(await merged.access?.create?.({ req: {} as never })).toBe(true);
  });

  it('user admin keys win per-key, base fills the rest', () => {
    const merged = mergeChatCollection({
      user: { slug: 'threads', fields: [], admin: { useAsTitle: 'department' } },
      base: makeBase(),
      reservedFields: [],
    });
    expect(merged.admin).toMatchObject({ group: 'Chat', useAsTitle: 'department' });
  });

  it('user top-level options win, base fills the rest', () => {
    const merged = mergeChatCollection({
      user: { slug: 'threads', fields: [], trash: false },
      base: makeBase(),
      reservedFields: [],
    });
    expect(merged.trash).toBe(false);
    const defaulted = mergeChatCollection({ user: { slug: 'threads', fields: [] }, base: makeBase(), reservedFields: [] });
    expect(defaulted.trash).toBe(true);
  });

  it('throws when the user redefines a reserved field', () => {
    expect(() =>
      mergeChatCollection({
        user: { slug: 'messages', fields: [{ name: 'parts', type: 'json' }] },
        base: makeBase({ slug: 'messages' }),
        reservedFields: ['parts', 'thread'],
      }),
    ).toThrow("[frogbot] Field 'parts' on collection 'messages' is reserved by chat persistence.");
  });

  it("throws when the user changes a base field's type", () => {
    expect(() =>
      mergeChatCollection({
        user: { slug: 'threads', fields: [{ name: 'agent', type: 'number' }] },
        base: makeBase(),
        reservedFields: [],
      }),
    ).toThrow(
      "[frogbot] Field 'agent' on collection 'threads' has type 'text' required by chat persistence and cannot be changed to 'number'.",
    );
  });

  it('throws when the user changes a nested group subfield type', () => {
    expect(() =>
      mergeChatCollection({
        user: {
          slug: 'messages',
          fields: [{ name: 'usage', type: 'group', fields: [{ name: 'inputTokens', type: 'text' }] }],
        },
        base: makeBase({
          slug: 'messages',
          fields: [{ name: 'usage', type: 'group', fields: [{ name: 'inputTokens', type: 'number' }] }],
        }),
        reservedFields: [],
      }),
    ).toThrow(
      "[frogbot] Field 'inputTokens' on collection 'messages' has type 'number' required by chat persistence and cannot be changed to 'text'.",
    );
  });

  it('allows cosmetic overrides when the type is unchanged or omitted', () => {
    const merged = mergeChatCollection({
      user: { slug: 'threads', fields: [{ name: 'agent', label: 'Assistant' }] },
      base: makeBase(),
      reservedFields: [],
    });
    expect(merged.fields.find((f) => 'name' in f && f.name === 'agent')).toMatchObject({
      name: 'agent',
      type: 'text',
      index: true,
      label: 'Assistant',
    });
  });

  it('allows the user to repoint relationTo (follows renamed collections)', () => {
    const merged = mergeChatCollection({
      user: {
        slug: 'threads',
        fields: [{ name: 'user', type: 'relationship', relationTo: 'admins' }],
      },
      base: makeBase({
        fields: [{ name: 'user', type: 'relationship', relationTo: 'users' }],
      }),
      reservedFields: [],
    });
    expect(merged.fields.find((f) => 'name' in f && f.name === 'user')).toMatchObject({
      name: 'user',
      type: 'relationship',
      relationTo: 'admins',
    });
  });
});
