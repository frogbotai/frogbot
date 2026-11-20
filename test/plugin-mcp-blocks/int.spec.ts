import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApiKeyPrefix, hashApiKeyToken } from '@frogbotai/plugin-api-keys';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import {
  apiKeysSlug,
  apiKeyToken,
  groupedSlug,
  lockedSlug,
  mcpEndpoint,
  notesSlug,
  pagesSlug,
  plainSlug,
  testCredentials,
  unlistedSlug,
  usersSlug,
} from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Block = Record<string, unknown> & { id: string; blockType: string };

type ToolCallBody = {
  result: {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
};

type ToolsListBody = { result: { tools: Array<{ name: string }> } };

type Outline = {
  fields: Array<{
    path: string;
    blockTypes: string[];
    blocks: Array<{ index: number; id: string; blockType: string; title?: string }>;
  }>;
};

function parse<T>(body: T | string): T {
  const json =
    typeof body === 'string'
      ? (body
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6) ?? body)
      : JSON.stringify(body);

  return JSON.parse(json) as T;
}

describe('MCP block tools', () => {
  let booted: BootedFrogBot;
  let pageId: number | string;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const owner = await booted.frogbot.create({
      collection: usersSlug,
      data: testCredentials,
      overrideAccess: true,
    });

    await booted.frogbot.create({
      collection: apiKeysSlug,
      data: {
        name: 'Blocks',
        owner: owner.id,
        prefix: getApiKeyPrefix(apiKeyToken),
        tokenHash: hashApiKeyToken(apiKeyToken),
      },
      overrideAccess: true,
    });

    const page = await booted.frogbot.create({
      collection: pagesSlug,
      data: {
        title: 'Home',
        _status: 'published',
        hero: [{ id: 'hero1', blockType: 'banner', label: 'Welcome' }],
        layout: [
          {
            id: 'h1',
            blockType: 'heading',
            text: 'Intro',
            secret: 'keep-h1',
            style: { size: 'l', color: 'green' },
          },
          { id: 'q1', blockType: 'quote', body: 'Ship it', author: 'Sam' },
          {
            id: 'c1',
            blockType: 'columns',
            items: [{ id: 'h2', blockType: 'heading', text: 'Left', secret: 'keep-h2' }],
          },
        ],
      },
      overrideAccess: true,
    });

    pageId = page.id;
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  async function call(name: string, args: Record<string, unknown>) {
    const response = await booted.restClient.post<ToolCallBody | string>(
      mcpEndpoint,
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      {
        headers: {
          accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${apiKeyToken}`,
        },
      },
    );

    const { result } = parse<ToolCallBody>(response.body);

    return {
      isError: result.isError === true,
      text: result.content.map(({ text }) => text).join(''),
      data: result.structuredContent ?? {},
    };
  }

  const onPage = (args: Record<string, unknown>) => ({
    collection: pagesSlug,
    id: pageId,
    ...args,
  });

  type PageData = Record<string, unknown> & { layout: Block[]; hero: Block[] };

  const asData = (doc: object): PageData => JSON.parse(JSON.stringify(doc)) as PageData;

  async function draftPage() {
    return asData(
      await booted.frogbot.findByID({
        collection: pagesSlug,
        id: pageId,
        depth: 0,
        draft: true,
        overrideAccess: true,
        showHiddenFields: true,
      }),
    );
  }

  async function publishedPage() {
    return asData(
      await booted.frogbot.findByID({
        collection: pagesSlug,
        id: pageId,
        depth: 0,
        overrideAccess: true,
      }),
    );
  }

  const ids = (blocks: Block[]) => blocks.map(({ id }) => id);

  it('lists the six block tools', async () => {
    const response = await booted.restClient.post<ToolsListBody | string>(
      mcpEndpoint,
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      {
        headers: {
          accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${apiKeyToken}`,
        },
      },
    );

    const names = parse<ToolsListBody>(response.body).result.tools.map(({ name }) => name);

    expect(names).toEqual(
      expect.arrayContaining([
        'listBlocks',
        'getBlock',
        'insertBlock',
        'updateBlock',
        'moveBlock',
        'removeBlock',
      ]),
    );
  });

  it("listBlocks outlines every blocks field, nested ones included, with each field's block types", async () => {
    const { data, isError } = await call('listBlocks', onPage({}));

    expect(isError).toBe(false);
    expect((data as Outline).fields).toEqual([
      {
        path: 'hero',
        blockTypes: ['banner'],
        blocks: [{ index: 0, id: 'hero1', blockType: 'banner', title: 'Welcome' }],
      },
      {
        path: 'layout',
        blockTypes: ['heading', 'quote', 'columns'],
        blocks: [
          { index: 0, id: 'h1', blockType: 'heading', title: 'Intro' },
          { index: 1, id: 'q1', blockType: 'quote', title: 'Ship it' },
          { index: 2, id: 'c1', blockType: 'columns' },
        ],
      },
      {
        path: 'layout.2.items',
        blockTypes: ['heading', 'quote'],
        blocks: [{ index: 0, id: 'h2', blockType: 'heading', title: 'Left' }],
      },
    ]);
  });

  it('getBlock returns one block in full, without hidden fields', async () => {
    const quote = await call('getBlock', onPage({ blockId: 'q1' }));
    const heading = await call('getBlock', onPage({ blockId: 'h1' }));

    expect(quote.data).toMatchObject({
      path: 'layout',
      index: 1,
      block: { id: 'q1', blockType: 'quote', body: 'Ship it', author: 'Sam' },
    });
    expect(heading.data.block).toMatchObject({ text: 'Intro', style: { size: 'l' } });
    expect(heading.data.block).not.toHaveProperty('secret');
  });

  it.each([
    ['has no blocks fields', plainSlug],
    ['is not in the list', unlistedSlug],
    ["is one of FrogBot's own", apiKeysSlug],
    ['does not exist', 'nope'],
  ])('refuses a collection that %s', async (_name, collection) => {
    const { isError, text } = await call('listBlocks', { collection, id: 1 });

    expect(isError).toBe(true);
    expect(text).toBe(`The block tools can't edit the collection '${collection}'.`);
  });

  it('insertBlock places a block after another, saves a draft, and leaves the published page alone', async () => {
    const { data, isError } = await call(
      'insertBlock',
      onPage({ after: 'h1', block: { blockType: 'quote', body: 'New' } }),
    );

    expect(isError).toBe(false);
    expect(data).toMatchObject({ path: 'layout', index: 1, draft: true });

    const inserted = (data.block as Block).id;
    const draft = await draftPage();

    expect(ids(draft.layout)).toEqual(['h1', inserted, 'q1', 'c1']);
    expect(draft._status).toBe('draft');
    expect(ids((await publishedPage()).layout)).toEqual(['h1', 'q1', 'c1']);
  });

  it('insertBlock places a block at an index, and into an empty nested field', async () => {
    await call('removeBlock', onPage({ blockId: 'h2' }));

    expect(
      (
        await call(
          'insertBlock',
          onPage({ field: 'layout', index: 0, block: { blockType: 'quote', id: 'q0' } }),
        )
      ).isError,
    ).toBe(false);

    const nested = await call(
      'insertBlock',
      onPage({ field: 'layout.3.items', block: { blockType: 'heading', text: 'Inner' } }),
    );

    expect(nested).toMatchObject({ isError: false, data: { path: 'layout.3.items', index: 0 } });

    const draft = await draftPage();

    expect(ids(draft.layout)).toEqual(['q0', 'h1', 'q1', 'c1']);
    expect((draft.layout[3]?.items as Block[]).map(({ text }) => text)).toEqual(['Inner']);
  });

  it.each([
    [
      'a block type the field does not accept',
      { field: 'hero', block: { blockType: 'quote' } },
      "hero doesn't accept 'quote' blocks. It accepts: banner.",
    ],
    [
      'two positions',
      { field: 'layout', after: 'h1', block: { blockType: 'quote' } },
      'Pass exactly one of field, before or after.',
    ],
    [
      'an index past the end',
      { field: 'layout', index: 9, block: { blockType: 'quote' } },
      'index 9 is past the end of layout, which has 3 blocks.',
    ],
    [
      'a path that is not a blocks field',
      { field: 'title', block: { blockType: 'quote' } },
      "'title' is not a blocks field. Call listBlocks to see the fields' paths.",
    ],
    [
      'an id already in use',
      { field: 'layout', block: { blockType: 'quote', id: 'h2' } },
      "A block with the id 'h2' already exists.",
    ],
    [
      'an unknown anchor',
      { before: 'nope', block: { blockType: 'quote' } },
      "No block has the id 'nope'. Call listBlocks to see the block ids.",
    ],
  ])('insertBlock refuses %s and saves nothing', async (_name, args, message) => {
    const before = await draftPage();
    const result = await call('insertBlock', onPage(args));

    expect(result).toMatchObject({ isError: true, text: message });
    expect((await draftPage()).layout).toEqual(before.layout);
  });

  it('updateBlock changes only the fields passed, merging groups, and keeps every other block', async () => {
    const before = await draftPage();
    const result = await call(
      'updateBlock',
      onPage({ blockId: 'h1', data: { text: 'Hello', style: { color: 'blue' } } }),
    );

    expect(result).toMatchObject({
      isError: false,
      data: {
        path: 'layout',
        index: 0,
        block: { text: 'Hello', style: { size: 'l', color: 'blue' } },
      },
    });

    const after = await draftPage();

    expect(after.layout.slice(1)).toEqual(before.layout.slice(1));
    expect(after.hero).toEqual(before.hero);
    expect(after.title).toBe('Home');
  });

  it('updateBlock reaches a nested block', async () => {
    await call('updateBlock', onPage({ blockId: 'h2', data: { text: 'Right' } }));

    expect(((await draftPage()).layout[2]?.items as Block[])[0]).toMatchObject({
      id: 'h2',
      text: 'Right',
    });
  });

  it('updateBlock reports a schema error with its path when publishing, and saves nothing', async () => {
    const before = await draftPage();
    const result = await call(
      'updateBlock',
      onPage({ blockId: 'h1', data: { text: null }, draft: false }),
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('layout.0.text');
    expect(await draftPage()).toEqual(before);
  });

  it("updateBlock refuses to change a block's id or type", async () => {
    const result = await call(
      'updateBlock',
      onPage({ blockId: 'h1', data: { blockType: 'quote' } }),
    );

    expect(result).toMatchObject({
      isError: true,
      text: "data can't change a block's id or blockType. Insert a new block and remove this one.",
    });
  });

  it('updateBlock with draft: false publishes', async () => {
    await call('updateBlock', onPage({ blockId: 'q1', data: { author: 'Ada' }, draft: false }));

    const published = await publishedPage();

    expect(published._status).toBe('published');
    expect(published.layout[1]).toMatchObject({ author: 'Ada' });
  });

  it('moveBlock moves a block to an index, before another, and into a nested field', async () => {
    await call('moveBlock', onPage({ blockId: 'h1', field: 'layout', index: 2 }));

    expect(ids((await draftPage()).layout)).toEqual(['q1', 'c1', 'h1']);

    await call('moveBlock', onPage({ blockId: 'h1', before: 'q1' }));

    expect(ids((await draftPage()).layout)).toEqual(['h1', 'q1', 'c1']);

    const result = await call('moveBlock', onPage({ blockId: 'q1', after: 'h2' }));

    expect(result).toMatchObject({ isError: false, data: { path: 'layout.1.items', index: 1 } });

    const draft = await draftPage();

    expect(ids(draft.layout)).toEqual(['h1', 'c1']);
    expect(ids(draft.layout[1]?.items as Block[])).toEqual(['h2', 'q1']);
    expect((draft.layout[1]?.items as Block[])[1]).toMatchObject({
      body: 'Ship it',
      author: 'Sam',
    });
  });

  it('moveBlock moves a block out of a nested field by a path that the move shifts', async () => {
    await call('moveBlock', onPage({ blockId: 'h1', field: 'layout.2.items', index: 0 }));

    const draft = await draftPage();

    expect(ids(draft.layout)).toEqual(['q1', 'c1']);
    expect(ids(draft.layout[1]?.items as Block[])).toEqual(['h1', 'h2']);
  });

  it.each([
    ['inside itself', { blockId: 'c1', after: 'h2' }, "A block can't move inside itself."],
    [
      'into its own nested field',
      { blockId: 'c1', field: 'layout.2.items' },
      "A block can't move inside itself.",
    ],
    ['next to itself', { blockId: 'h1', after: 'h1' }, "A block can't move next to itself."],
    [
      'into a field that refuses its type',
      { blockId: 'c1', field: 'hero' },
      "hero doesn't accept 'columns' blocks. It accepts: banner.",
    ],
  ])('moveBlock refuses to move a block %s', async (_name, args, message) => {
    const before = await draftPage();

    expect(await call('moveBlock', onPage(args))).toMatchObject({ isError: true, text: message });
    expect((await draftPage()).layout).toEqual(before.layout);
  });

  it('removeBlock deletes one block and the blocks inside it', async () => {
    const result = await call('removeBlock', onPage({ blockId: 'c1' }));

    expect(result).toMatchObject({
      isError: false,
      data: { removed: { path: 'layout', index: 2, id: 'c1', blockType: 'columns' } },
    });
    expect(ids((await draftPage()).layout)).toEqual(['h1', 'q1']);
  });

  it('edits blocks fields inside a group and a named tab, even when they are empty', async () => {
    const doc = await booted.frogbot.create({
      collection: groupedSlug,
      data: { content: { layout: [{ id: 'g1', blockType: 'heading', text: 'G' }] } },
      overrideAccess: true,
    });

    const target = { collection: groupedSlug, id: doc.id };
    const outline = await call('listBlocks', target);

    expect(outline.isError).toBe(false);
    expect((outline.data as Outline).fields.map(({ path }) => path)).toContain('content.layout');
    expect(
      await call('insertBlock', {
        ...target,
        field: 'seo.extra',
        block: { blockType: 'quote', id: 'e1' },
      }),
    ).toMatchObject({ isError: false, data: { path: 'seo.extra', index: 0 } });
  });

  it("runs under the key owner's access: a collection they can read but not update can't be edited", async () => {
    const locked = await booted.frogbot.create({
      collection: lockedSlug,
      data: { body: [{ id: 'l1', blockType: 'heading', text: 'Fixed' }] },
      overrideAccess: true,
    });

    const target = { collection: lockedSlug, id: locked.id };

    expect((await call('listBlocks', target)).isError).toBe(false);
    expect(await call('removeBlock', { ...target, blockId: 'l1' })).toMatchObject({
      isError: true,
      text: 'You are not allowed to perform this action.',
    });

    const stored = await booted.frogbot.findByID({
      collection: lockedSlug,
      id: locked.id,
      overrideAccess: true,
    });

    expect(stored.body?.map(({ id }) => id)).toEqual(['l1']);
  });

  describe('break-it', () => {
    async function secrets() {
      const draft = await draftPage();
      const all = [
        ...draft.layout,
        ...draft.layout.flatMap((block) => (block.items as Block[]) ?? []),
      ];

      return Object.fromEntries(all.map((block) => [block.id, block.secret]));
    }

    it('keeps hidden fields, which reads never return, through updates and moves', async () => {
      await call('updateBlock', onPage({ blockId: 'h1', data: { text: 'Changed' } }));
      await call('updateBlock', onPage({ blockId: 'q1', data: { author: 'Kai' } }));
      await call('moveBlock', onPage({ blockId: 'h1', after: 'q1' }));
      await call('moveBlock', onPage({ blockId: 'h2', before: 'h1' }));

      const moved = await call('moveBlock', onPage({ blockId: 'h1', field: 'layout.3.items' }));

      expect(JSON.stringify(moved.data)).not.toContain('keep-');
      expect(ids((await draftPage()).layout)).toEqual(['q1', 'h2', 'c1']);
      expect(await secrets()).toMatchObject({ h1: 'keep-h1', h2: 'keep-h2' });
    });

    it('edits one locale without touching another', async () => {
      const note = await booted.frogbot.create({
        collection: notesSlug,
        data: { title: 'Note', body: [{ id: 'n1', blockType: 'quote', body: 'Hello' }] },
        locale: 'en',
        overrideAccess: true,
      });

      await booted.frogbot.update({
        collection: notesSlug,
        id: note.id,
        data: { body: [{ id: 'n2', blockType: 'quote', body: 'Hola' }] },
        locale: 'es',
        overrideAccess: true,
      });

      const edit = await call('updateBlock', {
        collection: notesSlug,
        id: note.id,
        locale: 'es',
        blockId: 'n2',
        data: { body: 'Buenas' },
      });

      expect(edit).toMatchObject({ isError: false, data: { block: { body: 'Buenas' } } });
      expect(edit.data).not.toHaveProperty('draft');

      const read = async (locale: 'en' | 'es') =>
        (
          (
            await booted.frogbot.findByID({
              collection: notesSlug,
              id: note.id,
              locale,
              overrideAccess: true,
            })
          ).body as Block[]
        ).map(({ body }) => body);

      expect(await read('en')).toEqual(['Hello']);
      expect(await read('es')).toEqual(['Buenas']);
    });

    it("edits an empty locale as empty, without copying or losing the fallback locale's blocks", async () => {
      const note = await booted.frogbot.create({
        collection: notesSlug,
        data: { title: 'Note', body: [{ id: 'n1', blockType: 'quote', body: 'Hello' }] },
        locale: 'en',
        overrideAccess: true,
      });

      const outline = await call('listBlocks', {
        collection: notesSlug,
        id: note.id,
        locale: 'es',
      });

      expect((outline.data as Outline).fields[0]?.blocks).toEqual([]);

      const insert = await call('insertBlock', {
        collection: notesSlug,
        id: note.id,
        locale: 'es',
        field: 'body',
        block: { blockType: 'quote', body: 'Hola' },
      });

      expect(insert.isError).toBe(false);

      const read = async (locale: 'en' | 'es') =>
        (
          (
            await booted.frogbot.findByID({
              collection: notesSlug,
              id: note.id,
              locale,
              fallbackLocale: 'none',
              overrideAccess: true,
            })
          ).body ?? []
        ).map((block) => ('body' in block ? block.body : null));

      expect(await read('en')).toEqual(['Hello']);
      expect(await read('es')).toEqual(['Hola']);
    });

    it('insertBlock refuses a block whose nested blocks reuse an id', async () => {
      const before = await draftPage();
      const result = await call(
        'insertBlock',
        onPage({
          field: 'layout',
          block: { blockType: 'columns', items: [{ id: 'h2', blockType: 'heading', text: 'Dup' }] },
        }),
      );

      expect(result).toMatchObject({
        isError: true,
        text: "A block with the id 'h2' already exists.",
      });
      expect((await draftPage()).layout).toEqual(before.layout);
    });

    it('a doc id that does not exist is an error, not a new document', async () => {
      const result = await call('insertBlock', {
        collection: pagesSlug,
        id: 999999,
        field: 'layout',
        block: { blockType: 'quote' },
      });

      expect(result.isError).toBe(true);
      expect(
        (await booted.frogbot.count({ collection: pagesSlug, overrideAccess: true })).totalDocs,
      ).toBe(1);
    });
  });
});
