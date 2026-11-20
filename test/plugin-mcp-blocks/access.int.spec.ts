import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApiKeyPrefix, hashApiKeyToken } from '@frogbotai/plugin-api-keys';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { adminEmail, memberEmail } from './access/config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const adminToken = `fb_${'B'.repeat(43)}`;
const memberToken = `fb_${'C'.repeat(43)}`;

type Row = Record<string, unknown> & { id: string; blockType: string };

type Doc = Record<string, unknown>;

type ToolCallBody = {
  result: {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
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

describe('block tools and field access, drafts and locales', () => {
  let booted: BootedFrogBot;
  let adminId: number | string;
  let memberId: number | string;

  beforeAll(async () => {
    booted = await bootFrogBot(path.join(dirname, 'access'), 'plugin-mcp-blocks-access');
  });

  afterAll(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const make = async (email: string, token: string) => {
      const user = await booted.frogbot.create({
        collection: 'users',
        data: { email, password: 'frogbot-test' },
        overrideAccess: true,
      });

      await booted.frogbot.create({
        collection: 'api-keys',
        data: {
          name: email,
          owner: user.id,
          prefix: getApiKeyPrefix(token),
          tokenHash: hashApiKeyToken(token),
        },
        overrideAccess: true,
      });

      return user.id as number | string;
    };

    adminId = await make(adminEmail, adminToken);
    memberId = await make(memberEmail, memberToken);
  });

  async function call(token: string, name: string, args: Record<string, unknown>) {
    const response = await booted.restClient.post<ToolCallBody | string>(
      '/api/mcp',
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      {
        headers: {
          accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
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

  const member = (name: string, args: Record<string, unknown>) => call(memberToken, name, args);

  async function stored(collection: string, id: number | string, extra: Doc = {}): Promise<Doc> {
    const doc = await booted.frogbot.findByID({
      collection: collection as 'users',
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      ...extra,
    });

    return JSON.parse(JSON.stringify(doc)) as Doc;
  }

  async function guarded(owner: number | string) {
    const doc = await booted.frogbot.create({
      collection: 'guarded' as 'users',
      data: {
        owner,
        body: [
          { id: 'b1', blockType: 'card', note: 'NOTE-b1', text: 'One', locked: 'LOCK-b1' },
          { id: 'b2', blockType: 'card', text: 'Two', locked: 'LOCK-b2' },
        ],
        aside: [],
        internal: [
          { id: 'i1', blockType: 'card', note: 'NOTE-i1', text: 'Hidden', locked: 'LOCK-i1' },
        ],
        frozen: [{ id: 'f1', blockType: 'card', text: 'Frozen' }],
      } as never,
      overrideAccess: true,
    });

    return doc.id as number | string;
  }

  async function docsInTwoLocales() {
    const created = await booted.frogbot.create({
      collection: 'docs' as 'users',
      data: {
        title: 'T',
        _status: 'published',
        layout: [
          { id: 'm1', blockType: 'intl', text: 'Hello', size: 's' },
          { id: 'm2', blockType: 'intl', text: 'Bye', size: 's' },
        ],
      } as never,
      locale: 'en',
      overrideAccess: true,
    });

    const id = created.id as number | string;

    await booted.frogbot.update({
      collection: 'docs' as 'users',
      id,
      locale: 'es',
      data: {
        _status: 'published',
        layout: [
          { id: 'm1', blockType: 'intl', text: 'Hola', size: 's' },
          { id: 'm2', blockType: 'intl', text: 'Adios', size: 's' },
        ],
      } as never,
      overrideAccess: true,
    });

    return id;
  }

  it('refuses to move a block with a field the caller may not update to another field, and saves nothing', async () => {
    const id = await guarded(memberId);
    const before = await stored('guarded', id);

    const byField = await member('moveBlock', {
      collection: 'guarded',
      id,
      blockId: 'b1',
      field: 'aside',
    });

    await booted.frogbot.update({
      collection: 'guarded' as 'users',
      id,
      data: { aside: [{ id: 'a1', blockType: 'card', text: 'Aside' }] } as never,
      overrideAccess: true,
    });

    const byAnchor = await member('moveBlock', {
      collection: 'guarded',
      id,
      blockId: 'b2',
      after: 'a1',
    });

    const after = await stored('guarded', id);

    expect(byField).toMatchObject({ isError: true });
    expect(byField.text).toContain('locked');
    expect(byAnchor).toMatchObject({ isError: true });
    expect(after.body).toEqual(before.body);
    expect((after.aside as Row[]).map(({ id }) => id)).toEqual(['a1']);
  });

  it('refuses to move a block with a localized field to another field, and keeps every locale', async () => {
    const id = await docsInTwoLocales();

    const cross = await member('moveBlock', {
      collection: 'docs',
      id,
      locale: 'en',
      blockId: 'm1',
      field: 'sidebar',
      draft: false,
    });

    expect(cross).toMatchObject({ isError: true });
    expect(cross.text).toContain('other locales');

    const es = await stored('docs', id, { locale: 'es', fallbackLocale: 'none' });

    expect((es.layout as Row[]).map(({ id, text }) => [id, text])).toEqual([
      ['m1', 'Hola'],
      ['m2', 'Adios'],
    ]);
  });

  it('updateBlock refuses nested blocks that reuse an id from elsewhere in the document', async () => {
    const id = await guarded(memberId);
    const result = await member('updateBlock', {
      collection: 'guarded',
      id,
      blockId: 'b1',
      data: { items: [{ id: 'b2', blockType: 'tile', label: 'dup' }] },
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.text).toContain("'b2' already exists");
    expect((await member('getBlock', { collection: 'guarded', id, blockId: 'b2' })).isError).toBe(
      false,
    );
  });

  it('updateBlock keeps the nested block ids it already has', async () => {
    const id = await guarded(memberId);
    const target = { collection: 'guarded', id, blockId: 'b1' };

    await member('updateBlock', {
      ...target,
      data: { items: [{ id: 't1', blockType: 'tile', label: 'first' }] },
    });

    const again = await member('updateBlock', {
      ...target,
      data: { items: [{ id: 't1', blockType: 'tile', label: 'second' }] },
    });

    expect(again.isError).toBe(false);
    expect(((await stored('guarded', id)).body as Row[])[0]?.items).toMatchObject([
      { id: 't1', label: 'second' },
    ]);
  });

  it("write tools don't find blocks inside a blocks field the caller can't read", async () => {
    const id = await guarded(memberId);
    const target = { collection: 'guarded', id };

    expect((await member('getBlock', { ...target, blockId: 'i1' })).isError).toBe(true);

    const removed = await member('removeBlock', { ...target, blockId: 'i1' });
    const updated = await member('updateBlock', { ...target, blockId: 'i1', data: { text: 'x' } });
    const anchored = await member('insertBlock', {
      ...target,
      after: 'i1',
      block: { blockType: 'card' },
    });

    for (const result of [removed, updated, anchored]) {
      expect(result).toMatchObject({ isError: true });
      expect(JSON.stringify(result)).not.toContain('internal');
    }

    expect(
      ((await stored('guarded', id)).internal as Row[]).map(({ id, text }) => [id, text]),
    ).toEqual([['i1', 'Hidden']]);
  });

  it("refuses a move or insert into a blocks field the caller can't read, without counting its rows", async () => {
    const id = await guarded(memberId);
    const moved = await member('moveBlock', {
      collection: 'guarded',
      id,
      blockId: 'b2',
      field: 'internal',
    });

    const inserted = await member('insertBlock', {
      collection: 'guarded',
      id,
      field: 'internal',
      index: 9,
      block: { blockType: 'card' },
    });

    expect(moved).toMatchObject({ isError: true });
    expect(inserted).toMatchObject({ isError: true });
    expect(inserted.text).not.toMatch(/has \d+ blocks/);
    expect(((await stored('guarded', id)).internal as Row[]).map(({ id }) => id)).toEqual(['i1']);
  });

  it("reports where a block went when it saved into a field the caller can't read back", async () => {
    const id = await guarded(memberId);
    const inserted = await member('insertBlock', {
      collection: 'guarded',
      id,
      field: 'vault',
      block: { id: 'v1', blockType: 'tile', label: 'Kept' },
    });

    expect(inserted).toMatchObject({ isError: false, data: { path: 'vault', index: 0 } });
    expect(inserted.data).not.toHaveProperty('block');
    expect((await stored('guarded', id)).vault).toMatchObject([{ id: 'v1', label: 'Kept' }]);
  });

  it('a block field the caller cannot read never shows in getBlock, listBlocks titles or write results', async () => {
    const id = await guarded(memberId);
    const target = { collection: 'guarded', id };

    await booted.frogbot.update({
      collection: 'guarded' as 'users',
      id,
      data: {
        body: [{ id: 'b1', blockType: 'card', note: 'NOTE-b1', locked: 'LOCK-b1' }],
      } as never,
      overrideAccess: true,
    });

    const outputs = [
      await member('listBlocks', target),
      await member('getBlock', { ...target, blockId: 'b1' }),
      await member('updateBlock', { ...target, blockId: 'b1', data: { text: 'T' } }),
      await member('insertBlock', {
        ...target,
        after: 'b1',
        block: { blockType: 'card', text: 'N' },
      }),
      await member('moveBlock', { ...target, blockId: 'b1', field: 'body', index: 1 }),
    ];

    for (const output of outputs) {
      expect(output.isError).toBe(false);
      expect(JSON.stringify(output)).not.toContain('NOTE-');
    }
  });

  it('updateBlock and in-field moves never change a field the caller may not update', async () => {
    const id = await guarded(memberId);
    const target = { collection: 'guarded', id };

    await member('updateBlock', {
      ...target,
      blockId: 'b1',
      data: { locked: 'HACKED', note: 'HACKED' },
    });

    await member('updateBlock', { ...target, blockId: 'b1', data: { text: 'Changed' } });
    await member('moveBlock', { ...target, blockId: 'b1', after: 'b2' });

    const body = (await stored('guarded', id)).body as Row[];

    expect(body.map(({ id }) => id)).toEqual(['b2', 'b1']);
    expect(body[1]).toMatchObject({ text: 'Changed', locked: 'LOCK-b1', note: 'NOTE-b1' });
  });

  it("a caller who may read but not update this document (where-constrained) can't edit it", async () => {
    const id = await guarded(adminId);
    const target = { collection: 'guarded', id };
    const before = await stored('guarded', id);

    expect((await member('listBlocks', target)).isError).toBe(false);

    const results = [
      await member('updateBlock', { ...target, blockId: 'b1', data: { text: 'x' } }),
      await member('insertBlock', { ...target, field: 'aside', block: { blockType: 'card' } }),
      await member('moveBlock', { ...target, blockId: 'b1', after: 'b2' }),
      await member('removeBlock', { ...target, blockId: 'b2' }),
    ];

    for (const result of results) expect(result.isError).toBe(true);

    expect(await stored('guarded', id)).toEqual(before);
  });

  it('updateBlock starts from the newest draft, keeps its other changes, and draft:false publishes them', async () => {
    const created = await booted.frogbot.create({
      collection: 'docs' as 'users',
      data: {
        title: 'Pub',
        _status: 'published',
        layout: [
          {
            id: 'd1',
            blockType: 'card',
            text: 'A',
            items: [{ id: 't1', blockType: 'tile', label: 'L' }],
          },
          { id: 'd2', blockType: 'card', text: 'B' },
        ],
      } as never,
      overrideAccess: true,
    });

    const id = created.id as number | string;

    await booted.frogbot.update({
      collection: 'docs' as 'users',
      id,
      draft: true,
      data: {
        title: 'Draft title',
        layout: [
          {
            id: 'd1',
            blockType: 'card',
            text: 'A',
            items: [{ id: 't1', blockType: 'tile', label: 'L' }],
          },
          { id: 'd2', blockType: 'card', text: 'B-draft' },
        ],
      } as never,
      overrideAccess: true,
    });

    const edit = await member('updateBlock', {
      collection: 'docs',
      id,
      blockId: 'd1',
      data: { text: 'A2' },
    });

    expect(edit).toMatchObject({ isError: false, data: { draft: true } });

    const draft = await stored('docs', id, { draft: true });

    expect(draft.title).toBe('Draft title');
    expect(draft.layout).toMatchObject([
      { id: 'd1', text: 'A2', items: [{ id: 't1', label: 'L' }] },
      { id: 'd2', text: 'B-draft' },
    ]);
    expect((await stored('docs', id)).layout).toMatchObject([{ text: 'A' }, { text: 'B' }]);

    const publish = await member('updateBlock', {
      collection: 'docs',
      id,
      blockId: 'd2',
      data: { text: 'B3' },
      draft: false,
    });

    expect(publish).toMatchObject({ isError: false, data: { draft: false } });

    const published = await stored('docs', id);

    expect(published._status).toBe('published');
    expect(published.layout).toMatchObject([{ text: 'A2' }, { text: 'B3' }]);
  });

  it('editing locale es leaves en alone and never writes the en fallback into es', async () => {
    const created = await booted.frogbot.create({
      collection: 'docs' as 'users',
      data: {
        title: 'T',
        _status: 'published',
        layout: [{ id: 'x1', blockType: 'intl', text: 'Hello', size: 's' }],
      } as never,
      locale: 'en',
      overrideAccess: true,
    });

    const id = created.id as number | string;

    const edit = await member('updateBlock', {
      collection: 'docs',
      id,
      locale: 'es',
      blockId: 'x1',
      data: { size: 'm' },
      draft: false,
    });

    expect(edit.isError).toBe(false);

    const es = await stored('docs', id, { locale: 'es', fallbackLocale: 'none' });
    const en = await stored('docs', id, { locale: 'en' });

    expect((es.layout as Row[])[0]?.text ?? null).toBeNull();
    expect(es.title ?? null).toBeNull();
    expect((en.layout as Row[])[0]).toMatchObject({ text: 'Hello', size: 'm' });
    expect(en.title).toBe('T');

    await member('updateBlock', {
      collection: 'docs',
      id,
      locale: 'es',
      blockId: 'x1',
      data: { text: 'Hola' },
      draft: false,
    });

    expect(((await stored('docs', id, { locale: 'en' })).layout as Row[])[0]?.text).toBe('Hello');
    expect(((await stored('docs', id, { locale: 'es' })).layout as Row[])[0]?.text).toBe('Hola');
  });

  it("locale 'all' on an edit tool errors or keeps every locale's blocks", async () => {
    const note = await booted.frogbot.create({
      collection: 'notes' as 'users',
      data: { body: [{ id: 'e1', blockType: 'intl', size: 'en' }] } as never,
      locale: 'en',
      overrideAccess: true,
    });

    const id = note.id as number | string;

    await booted.frogbot.update({
      collection: 'notes' as 'users',
      id,
      locale: 'es',
      data: { body: [{ id: 's1', blockType: 'intl', size: 'es' }] } as never,
      overrideAccess: true,
    });

    await member('insertBlock', {
      collection: 'notes',
      id,
      locale: 'all',
      field: 'body',
      block: { blockType: 'intl', size: 'new' },
    });

    const ids = async (locale: string) =>
      (
        ((await stored('notes', id, { locale, fallbackLocale: 'none' })).body as
          Row[] | undefined) ?? []
      ).map(({ id }) => id);

    expect(await ids('en')).toContain('e1');
    expect(await ids('es')).toContain('s1');
  });
});
