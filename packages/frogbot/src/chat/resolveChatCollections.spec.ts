import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../types/collection.js';
import type { FrogbotConfig } from '../types/config.js';
import { CHAT_ASSETS_SLUG, resolveChatCollections } from './resolveChatCollections.js';

const agents = [{ slug: 'assistant', model: 'openai/test', instructions: 'Assist.' }] as FrogbotConfig['agents'];

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

  it('injects default threads and messages collections when agents are configured', () => {
    const result = resolveChatCollections(make([]));
    expect(slugs(result.collections)).toEqual(['threads', 'messages']);
    expect(result.chat).toEqual({ enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' });
  });

  it('keeps user collections and appends the injected chat collections', () => {
    const result = resolveChatCollections(make([{ slug: 'posts', fields: [] }]));
    expect(slugs(result.collections)).toEqual(['posts', 'threads', 'messages']);
  });

  it('enables persistence when a marker is present without agents', () => {
    const result = resolveChatCollections(make([{ slug: 'convos', thread: true, fields: [] }], { agents: undefined }));
    expect(result.chat).toEqual({ enabled: true, threadsSlug: 'convos', messagesSlug: 'messages' });
    expect(slugs(result.collections)).toEqual(['convos', 'messages']);
  });

  it('adopts a `thread: true` collection under its own slug and merges base fields', () => {
    const result = resolveChatCollections(
      make([{ slug: 'conversations', thread: true, fields: [{ name: 'department', type: 'text' }] }]),
    );
    expect(result.chat).toEqual({ enabled: true, threadsSlug: 'conversations', messagesSlug: 'messages' });
    const threads = result.collections.find((c) => c.slug === 'conversations');
    expect(threads?.fields.map((f) => ('name' in f ? f.name : undefined))).toEqual([
      'department',
      'title',
      'user',
      'agent',
      'lastMessageAt',
    ]);
  });

  it('adopts a `message: true` collection and wires its thread relation to the resolved threads slug', () => {
    const result = resolveChatCollections(
      make([
        { slug: 'conversations', thread: true, fields: [] },
        { slug: 'turns', message: true, fields: [] },
      ]),
    );
    expect(result.chat).toEqual({ enabled: true, threadsSlug: 'conversations', messagesSlug: 'turns' });
    const turns = result.collections.find((c) => c.slug === 'turns');
    const thread = turns?.fields.find((f) => 'name' in f && f.name === 'thread');
    expect(thread).toMatchObject({ relationTo: 'conversations' });
  });

  it('wires the threads user relation to the derived user collection', () => {
    const result = resolveChatCollections(make([{ slug: 'members', auth: true, fields: [] }]));
    const threads = result.collections.find((c) => c.slug === 'threads');
    const user = threads?.fields.find((f) => 'name' in f && f.name === 'user');
    expect(user).toMatchObject({ relationTo: 'members' });
  });

  it('throws when multiple auth collections exist without admin.user', () => {
    const collections: CollectionConfig[] = [
      { slug: 'admins', auth: true, fields: [] },
      { slug: 'customers', auth: true, fields: [] },
    ];
    expect(() => resolveChatCollections(make(collections))).toThrow('[frogbot] Multiple auth collections found');
  });

  it('throws when two collections carry the same marker', () => {
    const collections: CollectionConfig[] = [
      { slug: 'a', thread: true, fields: [] },
      { slug: 'b', thread: true, fields: [] },
    ];
    expect(() => resolveChatCollections(make(collections))).toThrow(
      '[frogbot] Multiple collections marked `thread: true` (a, b). Mark exactly one.',
    );
  });

  it('throws when one collection is marked as both thread and message', () => {
    expect(() => resolveChatCollections(make([{ slug: 'both', thread: true, message: true, fields: [] }]))).toThrow(
      "[frogbot] Collection 'both' is marked as both `thread` and `message`. Pick one.",
    );
  });

  it('throws when an unmarked collection occupies a default chat slug', () => {
    expect(() => resolveChatCollections(make([{ slug: 'threads', fields: [] }]))).toThrow(
      "[frogbot] Collection slug 'threads' conflicts with the default chat thread collection. " +
        'Add `thread: true` to adopt it, or rename it.',
    );
    expect(() => resolveChatCollections(make([{ slug: 'messages', fields: [] }]))).toThrow(
      "[frogbot] Collection slug 'messages' conflicts with the default chat message collection. " +
        'Add `message: true` to adopt it, or rename it.',
    );
  });

  it('throws when a marked thread collection redefines `user`', () => {
    expect(() =>
      resolveChatCollections(make([{ slug: 'convos', thread: true, fields: [{ name: 'user', type: 'text' }] }])),
    ).toThrow("[frogbot] Field 'user' on collection 'convos' is reserved by chat persistence.");
  });

  it('throws when a marked message collection redefines `parts` or `thread`', () => {
    for (const name of ['parts', 'thread']) {
      expect(() =>
        resolveChatCollections(make([{ slug: 'turns', message: true, fields: [{ name, type: 'json' }] }])),
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
