import { describe, expect, it } from 'vitest';

import { ids, useAccessHarness } from './access/harness.js';

describe("block tools and fields the caller can't read because of a hidden field", () => {
  const { state, member, stored } = useAccessHarness('plugin-mcp-blocks-hidden');

  async function probe(data: Record<string, unknown>) {
    const doc = await state.booted.frogbot.create({
      collection: 'probes' as 'users',
      data,
      overrideAccess: true,
    });

    return doc.id as number | string;
  }

  const target = (id: number | string) => ({ collection: 'probes', id });
  const tile = (id: string) => ({ id, blockType: 'tile', label: 'Secret' });
  const word = (id: string) => ({ id, blockType: 'word', text: 'Secret', locked: 'L' });

  it('listBlocks leaves out a blocks field whose read access looks at a hidden sibling', async () => {
    const id = await probe({ internal: true, list: [tile('l1'), tile('l2')] });
    const listed = await member('listBlocks', target(id));
    const paths = (listed.data as { fields: { path: string }[] }).fields.map(({ path }) => path);

    expect(ids((await stored('probes', id)).list)).toEqual(['l1', 'l2']);
    expect(paths).toEqual(['body', 'other']);
  });

  it("an index into a field hidden by a hidden-sibling rule doesn't reveal its row count", async () => {
    const empty = await probe({ internal: true });
    const full = await probe({ internal: true, list: [tile('l1'), tile('l2')] });
    const insert = (id: number | string) =>
      member('insertBlock', {
        ...target(id),
        field: 'list',
        index: 5,
        block: { blockType: 'tile' },
      });

    const a = await insert(empty);
    const b = await insert(full);

    expect([a.isError, b.isError]).toEqual([true, true]);
    expect(b.text).not.toMatch(/\d+ blocks/);
    expect(b.text).toBe(a.text);
  });

  it('inserting at the end of a field hidden by a hidden-sibling rule saves and says so', async () => {
    const id = await probe({ internal: true, list: [tile('l1')] });
    const inserted = await member('insertBlock', {
      ...target(id),
      field: 'list',
      block: { id: 'n1', blockType: 'tile', label: 'New' },
    });

    expect(ids((await stored('probes', id)).list)).toEqual(['l1', 'n1']);
    expect(inserted).toMatchObject({ isError: false, data: { path: 'list' } });
  });

  it("moveBlock's refusal to move to another field names no path inside a field the caller can't read", async () => {
    const id = await probe({
      body: [
        {
          id: 'x1',
          blockType: 'crate',
          text: 'open',
          inner: [word('w1'), word('w2')],
          hid: [word('h1')],
        },
      ],
    });

    const moved = await member('moveBlock', { ...target(id), blockId: 'x1', field: 'other' });

    expect(moved).toMatchObject({ isError: true });
    expect(moved.text).toContain(
      'would lose fields with their own edit access and the other locales of some fields.',
    );
    expect(moved.text).not.toMatch(/inner|hid/);
    expect(ids((await stored('probes', id)).body)).toEqual(['x1']);
  });
});
