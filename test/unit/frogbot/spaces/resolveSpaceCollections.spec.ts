import { describe, expect, it } from 'vitest';

import { resolveChatCollections } from '../../../../packages/frogbot/src/chat/resolveChatCollections.js';
import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { SPACE_FILES_SLUG } from '../../../../packages/frogbot/src/spaces/collections.js';

const agents: FrogBotConfig['agents'] = [
  { slug: 'assistant', model: 'openai/gpt-5-nano', instructions: 'Assist.' },
];

function resolve(collections: CollectionConfig[]) {
  return resolveChatCollections({
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections,
    agents,
  });
}

function fieldNames(collection: CollectionConfig | undefined): (string | undefined)[] {
  return (collection?.fields ?? []).map((field) => ('name' in field ? field.name : undefined));
}

describe('Spaces collections', () => {
  it('adds a spaces collection and a space field on chats whenever chat is on', () => {
    const { collections, chat } = resolve([]);
    const spaces = collections.find(({ slug }) => slug === 'spaces');

    expect(chat).toMatchObject({ spacesSlug: 'spaces', spaceFilesSlug: SPACE_FILES_SLUG });
    expect(fieldNames(spaces)).toEqual(['title', 'instructions', 'files', 'user']);
    expect(fieldNames(collections.find(({ slug }) => slug === 'chats'))).toContain('space');
    expect(collections.some(({ slug }) => slug === SPACE_FILES_SLUG)).toBe(true);
  });

  it('adopts a `space: true` collection under its own slug, keeping its fields and access', () => {
    const read = () => true;
    const { collections, chat } = resolve([
      { slug: 'clients', space: true, access: { read }, fields: [{ name: 'name', type: 'text' }] },
    ]);

    const clients = collections.find(({ slug }) => slug === 'clients');
    const chats = collections.find(({ slug }) => slug === 'chats');
    const space = chats?.fields.find((field) => 'name' in field && field.name === 'space');

    expect(chat).toMatchObject({ spacesSlug: 'clients' });
    expect(collections.some(({ slug }) => slug === 'spaces')).toBe(false);
    expect(fieldNames(clients)).toEqual(['name', 'instructions', 'files']);
    expect(clients?.access?.read).toBe(read);
    expect(space).toMatchObject({ type: 'relationship', relationTo: 'clients' });
  });

  it('throws when two collections are marked `space: true`', () => {
    expect(() =>
      resolve([
        { slug: 'clients', space: true, fields: [] },
        { slug: 'projects', space: true, fields: [] },
      ]),
    ).toThrow('Multiple collections marked `space: true` (clients, projects)');
  });

  it('throws when an unmarked collection takes the spaces slug', () => {
    expect(() => resolve([{ slug: 'spaces', fields: [] }])).toThrow(
      "Collection slug 'spaces' conflicts with the default Space collection. Add `space: true` to adopt it, or rename it.",
    );
  });

  it('refuses a `files` field on an adopted collection', () => {
    expect(() =>
      resolve([{ slug: 'clients', space: true, fields: [{ name: 'files', type: 'text' }] }]),
    ).toThrow("Field 'files' on collection 'clients' is reserved by Spaces.");
  });
});
