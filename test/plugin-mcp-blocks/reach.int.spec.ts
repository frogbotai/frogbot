import { describe, expect, it } from 'vitest';

import type { Row } from './access/harness.js';
import { ids, useAccessHarness } from './access/harness.js';

describe('block tools and blocks fields the caller may not update or read', () => {
  const { state, admin, member, stored } = useAccessHarness('plugin-mcp-blocks-reach');

  async function page(data: Record<string, unknown>) {
    const doc = await state.booted.frogbot.create({
      collection: 'pages' as 'users',
      data,
      overrideAccess: true,
    });

    return doc.id as number | string;
  }

  const target = (id: number | string) => ({ collection: 'pages', id });

  it('refuses to move a block into a blocks field the caller may not update, and keeps it', async () => {
    const id = await page({
      body: [{ id: 'm1', blockType: 'tile', label: 'Mine' }],
      frozen: [{ id: 'f1', blockType: 'tile', label: 'Frozen' }],
    });

    const moved = await member('moveBlock', { ...target(id), blockId: 'm1', field: 'frozen' });
    const after = await stored('pages', id);

    expect(moved).toMatchObject({ isError: true });
    expect(moved.text).toContain('frozen');
    expect(ids(after.body)).toEqual(['m1']);
    expect(ids(after.frozen)).toEqual(['f1']);
  });

  it('refuses to move a block out of a blocks field the caller may not update', async () => {
    const id = await page({ frozen: [{ id: 'f1', blockType: 'tile', label: 'Frozen' }] });

    const moved = await member('moveBlock', { ...target(id), blockId: 'f1', field: 'body' });
    const after = await stored('pages', id);

    expect(moved).toMatchObject({ isError: true });
    expect(ids(after.body)).toEqual([]);
    expect(ids(after.frozen)).toEqual(['f1']);
  });

  it('refuses to move a block into a nested blocks field with its own update access', async () => {
    const id = await page({
      body: [
        { id: 'c1', blockType: 'box', text: 'Box', slots: [] },
        { id: 't1', blockType: 'tile', label: 'Loose' },
      ],
    });

    const moved = await member('moveBlock', {
      ...target(id),
      blockId: 't1',
      field: 'body.0.slots',
    });

    const body = (await stored('pages', id)).body as Row[];

    expect(moved).toMatchObject({ isError: true });
    expect(ids(body)).toEqual(['c1', 't1']);
    expect(ids(body[0]?.slots)).toEqual([]);
  });

  it('insertBlock and removeBlock refuse a blocks field the caller may not update', async () => {
    const id = await page({ frozen: [{ id: 'f1', blockType: 'tile', label: 'Frozen' }] });

    const inserted = await member('insertBlock', {
      ...target(id),
      field: 'frozen',
      block: { id: 'n1', blockType: 'tile', label: 'New' },
    });

    const removed = await member('removeBlock', { ...target(id), blockId: 'f1' });

    expect(inserted).toMatchObject({ isError: true });
    expect(removed).toMatchObject({ isError: true });
    expect(ids((await stored('pages', id)).frozen)).toEqual(['f1']);
  });

  it('a caller the field access allows still edits that blocks field', async () => {
    const id = await page({ frozen: [{ id: 'f1', blockType: 'tile', label: 'Frozen' }] });

    const inserted = await admin('insertBlock', {
      ...target(id),
      field: 'frozen',
      block: { id: 'n1', blockType: 'tile', label: 'New' },
    });

    expect(inserted).toMatchObject({ isError: false, data: { path: 'frozen', index: 1 } });
    expect(ids((await stored('pages', id)).frozen)).toEqual(['f1', 'n1']);
  });

  it('a leading-zero path never reaches an unreadable nested field or reveals its row count', async () => {
    const id = await page({
      body: [
        { id: 'c1', blockType: 'box', inner: [{ id: 'x1', blockType: 'tile', label: 'Secret' }] },
        { id: 't1', blockType: 'tile', label: 'Mine' },
      ],
    });

    const counted = await member('insertBlock', {
      ...target(id),
      field: 'body.00.inner',
      index: 99,
      block: { blockType: 'tile' },
    });

    const inserted = await member('insertBlock', {
      ...target(id),
      field: 'body.00.inner',
      block: { id: 'n1', blockType: 'tile' },
    });

    const moved = await member('moveBlock', {
      ...target(id),
      blockId: 't1',
      field: 'body.00.inner',
    });

    expect(counted.text).not.toMatch(/has \d+ blocks/);
    expect({ inserted: inserted.isError, moved: moved.isError }).toEqual({
      inserted: true,
      moved: true,
    });
    expect(ids(((await stored('pages', id)).body as Row[])[0]?.inner)).toEqual(['x1']);
  });

  it("updateBlock refuses a nested block that reuses the block's own id", async () => {
    const id = await page({ body: [{ id: 'c1', blockType: 'box', text: 'Box' }] });

    const result = await member('updateBlock', {
      ...target(id),
      blockId: 'c1',
      data: { items: [{ id: 'c1', blockType: 'tile', label: 'dup' }] },
    });

    expect(result).toMatchObject({ isError: true });
    expect((await member('getBlock', { ...target(id), blockId: 'c1' })).isError).toBe(false);
  });

  it('updateBlock refuses copying a nested id that stays in a sibling blocks field', async () => {
    const id = await page({
      body: [{ id: 'c1', blockType: 'box', items: [{ id: 't1', blockType: 'tile', label: 'A' }] }],
    });

    const result = await member('updateBlock', {
      ...target(id),
      blockId: 'c1',
      data: { more: [{ id: 't1', blockType: 'tile', label: 'B' }] },
    });

    expect(result).toMatchObject({ isError: true });
    expect((await member('getBlock', { ...target(id), blockId: 't1' })).isError).toBe(false);
  });

  it("an index past the end of an unreadable empty field doesn't reveal its row count", async () => {
    const id = await page({});

    const result = await member('insertBlock', {
      ...target(id),
      field: 'vault',
      index: 3,
      block: { blockType: 'tile', label: 'x' },
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.text).not.toMatch(/has \d+ blocks/);
  });
});
