import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogbotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { CHAT_ASSETS_SLUG, resolveChatCollections } from '../../../../packages/frogbot/src/chat/resolveChatCollections.js';

const agents = [
  { slug: 'assistant', model: 'openai/test', instructions: 'Assist.' },
] as FrogbotConfig['agents'];

function make(collections: CollectionConfig[], overrides?: Partial<FrogbotConfig>): FrogbotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogbotConfig['db'],
    collections,
    agents,
    ...overrides,
  };
}

function slugs(collections: CollectionConfig[]): string[] {
  return collections.map((c) => c.slug);
}

describe('resolveChatCollections', () => {
  it('is disabled when neither agents nor markers are present', () => {
    const collections = [{ slug: 'posts', fields: [] }];
    const result = resolveChatCollections(make(collections, { agents: undefined }));
    expect(result.chat).toEqual({ enabled: false });
    expect(result.collections).toBe(collections);
  });

  it('injects default chats and messages collections when agents are configured', () => {
    const result = resolveChatCollections(make([]));
    expect(slugs(result.collections)).toEqual(['chats', 'messages']);
    expect(result.chat).toEqual({
      enabled: true,
      chatsSlug: 'chats',
      messagesSlug: 'messages',
    });
  });

  it('keeps user collections and appends the injected chat collections', () => {
    const result = resolveChatCollections(make([{ slug: 'posts', fields: [] }]));
    expect(slugs(result.collections)).toEqual(['posts', 'chats', 'messages']);
  });

  it('enables persistence when a marker is present without agents', () => {
    const result = resolveChatCollections(
      make([{ slug: 'convos', chat: true, fields: [] }], { agents: undefined }),
    );
    expect(result.chat).toEqual({ enabled: true, chatsSlug: 'convos', messagesSlug: 'messages' });
    expect(slugs(result.collections)).toEqual(['convos', 'messages']);
  });

  it('adopts a `chat: true` collection under its own slug and merges base fields', () => {
    const result = resolveChatCollections(
      make([
        { slug: 'conversations', chat: true, fields: [{ name: 'department', type: 'text' }] },
      ]),
    );
    expect(result.chat).toEqual({
      enabled: true,
      chatsSlug: 'conversations',
      messagesSlug: 'messages',
    });
    const chats = result.collections.find((c) => c.slug === 'conversations');
    expect(chats?.fields.map((f) => ('name' in f ? f.name : undefined))).toEqual([
      'department',
      'title',
      'user',
      'agent',
      'lastMessageAt',
      'todos',
    ]);
  });

  it('adopts a `message: true` collection and wires its chat relation to the resolved chat slug', () => {
    const result = resolveChatCollections(
      make([
        { slug: 'conversations', chat: true, fields: [] },
        { slug: 'turns', message: true, fields: [] },
      ]),
    );
    expect(result.chat).toEqual({
      enabled: true,
      chatsSlug: 'conversations',
      messagesSlug: 'turns',
    });
    const turns = result.collections.find((c) => c.slug === 'turns');
    const chat = turns?.fields.find((f) => 'name' in f && f.name === 'chat');
    expect(chat).toMatchObject({ relationTo: 'conversations' });
  });

  it('wires the chats user relation to the derived user collection', () => {
    const result = resolveChatCollections(make([{ slug: 'members', auth: true, fields: [] }]));
    const chats = result.collections.find((c) => c.slug === 'chats');
    const user = chats?.fields.find((f) => 'name' in f && f.name === 'user');
    expect(user).toMatchObject({ relationTo: 'members' });
  });

  it('throws when multiple auth collections exist without admin.user', () => {
    const collections: CollectionConfig[] = [
      { slug: 'admins', auth: true, fields: [] },
      { slug: 'customers', auth: true, fields: [] },
    ];
    expect(() => resolveChatCollections(make(collections))).toThrow(
      '[frogbot] Multiple auth collections found',
    );
  });

  it('throws when two collections carry the same marker', () => {
    const collections: CollectionConfig[] = [
      { slug: 'a', chat: true, fields: [] },
      { slug: 'b', chat: true, fields: [] },
    ];
    expect(() => resolveChatCollections(make(collections))).toThrow(
      '[frogbot] Multiple collections marked `chat: true` (a, b). Mark exactly one.',
    );
  });

  it('throws when one collection is marked as both chat and message', () => {
    expect(() =>
      resolveChatCollections(make([{ slug: 'both', chat: true, message: true, fields: [] }])),
    ).toThrow("[frogbot] Collection 'both' is marked as both `chat` and `message`. Pick one.");
  });

  it('throws when an unmarked collection occupies a default chat slug', () => {
    expect(() => resolveChatCollections(make([{ slug: 'chats', fields: [] }]))).toThrow(
      "[frogbot] Collection slug 'chats' conflicts with the default chat collection. " +
        'Add `chat: true` to adopt it, or rename it.',
    );
    expect(() => resolveChatCollections(make([{ slug: 'messages', fields: [] }]))).toThrow(
      "[frogbot] Collection slug 'messages' conflicts with the default chat message collection. " +
        'Add `message: true` to adopt it, or rename it.',
    );
  });

  it('throws when a marked chat collection redefines `user`', () => {
    expect(() =>
      resolveChatCollections(
        make([{ slug: 'convos', chat: true, fields: [{ name: 'user', type: 'text' }] }]),
      ),
    ).toThrow("[frogbot] Field 'user' on collection 'convos' is reserved by chat persistence.");
  });

  it('throws when a marked message collection redefines `id`, `parts`, or `chat`', () => {
    for (const name of ['id', 'parts', 'chat']) {
      expect(() =>
        resolveChatCollections(
          make([{ slug: 'turns', message: true, fields: [{ name, type: 'json' }] }]),
        ),
      ).toThrow(`[frogbot] Field '${name}' on collection 'turns' is reserved by chat persistence.`);
    }
  });

  it(`throws on the reserved '${CHAT_ASSETS_SLUG}' slug even without agents`, () => {
    const collections = [{ slug: CHAT_ASSETS_SLUG, fields: [] }];
    expect(() => resolveChatCollections(make(collections, { agents: undefined }))).toThrow(
      `[frogbot] Collection slug '${CHAT_ASSETS_SLUG}' is reserved for FrogBot chat assets.`,
    );
    expect(() => resolveChatCollections(make(collections))).toThrow(
      `[frogbot] Collection slug '${CHAT_ASSETS_SLUG}' is reserved for FrogBot chat assets.`,
    );
  });
});
