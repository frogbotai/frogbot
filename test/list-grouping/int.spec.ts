import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPayloadRequest, type PayloadRequest } from 'payload';
import type { ReactElement } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderGroupedTable } from '../../packages/ui/src/admin/views/List/groupedTable';
import { resolveViewSetup } from '../../packages/ui/src/admin/views/viewSetup';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';

vi.mock('@payloadcms/ui/rsc', () => ({ renderTable: () => ({ Table: null }) }));

vi.mock('../../packages/ui/src/admin/views/List/GroupSection.client', () => ({
  GroupSection: () => null,
}));

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

type Section = {
  canCreate: boolean;
  count: number;
  data?: { docs: Array<{ id: number | string }>; totalDocs: number };
  groupKey: string;
  label: string;
  prefill?: Record<string, unknown>;
};

type Slug = 'drafted' | 'items' | 'people';

describe(`grouped list body [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let req: PayloadRequest;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'list-grouping');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    const user = await booted.payload.create({
      collection: 'users',
      data: { email: 'grouping@frogbot.local', password: 'list-grouping' },
      overrideAccess: true,
    });

    req = await createPayloadRequest({
      payload: booted.payload,
      user: { ...user, collection: 'users' },
    });
  });

  const create = (collection: Slug, data: Record<string, unknown>) =>
    booted.payload.create({ collection, data, overrideAccess: true }) as Promise<{
      id: number | string;
    }>;

  async function render(
    collection: 'drafted' | 'items',
    groupBy: string,
    {
      fieldPermissions,
      limit = 10,
      query = {},
    }: { fieldPermissions?: unknown; limit?: number; query?: Record<string, unknown> } = {},
  ) {
    const result = await renderGroupedTable({
      canCreate: true,
      clientCollectionConfig: {} as never,
      collapsed: [],
      collectionConfig: booted.payload.collections[collection].config,
      columns: [{ accessor: 'title', active: true }],
      enableRowSelections: true,
      fieldPermissions: fieldPermissions as never,
      groupBy,
      limit,
      preferenceKey: `collection-${collection}-view-list`,
      query: { groupBy, ...query },
      req,
      viewType: 'list',
    });

    const sections = (result?.Table ?? []).map(
      (element) => (element as ReactElement<Section>).props,
    );

    return { result, sections };
  }

  const summary = (sections: Section[]) => sections.map(({ count, label }) => `${label}:${count}`);

  it('falls back to Payload for fields aggregate-style grouping cannot take', async () => {
    const person = await create('people', { name: 'Ada' });

    await create('items', {
      guarded: 'north',
      link: { relationTo: 'people', value: person.id },
      title: 'one',
    });

    expect((await render('items', 'guarded')).result).toBeUndefined();
    expect((await render('items', 'link')).result).toBeUndefined();
    expect((await render('items', 'secret')).result).toBeUndefined();
  });

  it('filters or searches a grouped list on a field whose read access lets the user read it', async () => {
    await create('items', { guarded: 'north', status: 'todo', title: 'one' });
    await create('items', { guarded: 'south', status: 'todo', title: 'two' });

    const outcome = async (query: Record<string, unknown>) =>
      render('items', 'status', { query }).then(
        ({ sections }) => summary(sections).join(','),
        (error: Error) => `threw: ${error.message}`,
      );

    expect({
      search: await outcome({ search: 'north' }),
      where: await outcome({ where: { guarded: { equals: 'north' } } }),
    }).toEqual({ search: 'To do:1,Doing:0,done:0', where: 'To do:1,Doing:0,done:0' });
  });

  it('does not save a groupBy that crashes the list, so a fresh visit still opens', async () => {
    await create('items', { guarded: 'north', title: 'one' });

    await resolveViewSetup({
      collectionSlug: 'items',
      query: { groupBy: 'guarded' },
      req,
      viewSlug: 'list',
    });

    const fresh = await resolveViewSetup({
      collectionSlug: 'items',
      query: {},
      req,
      viewSlug: 'list',
    });

    const groupBy = typeof fresh.query.groupBy === 'string' ? fresh.query.groupBy : undefined;

    const outcome = groupBy
      ? await render('items', groupBy).then(
          () => 'rendered',
          (error: Error) => `saved groupBy=${groupBy} threw: ${error.message}`,
        )
      : 'rendered';

    expect(outcome).toBe('rendered');
  });

  it('keeps a record saved as a newer draft in exactly one group, counted where it shows', async () => {
    const doc = await create('drafted', { _status: 'published', status: 'todo', title: 'moved' });

    await booted.payload.update({
      collection: 'drafted',
      data: { status: 'done' },
      draft: true,
      id: doc.id,
      overrideAccess: true,
    });

    const { result, sections } = await render('drafted', 'status');
    const showing = sections.filter(({ data }) => data?.docs.some(({ id }) => id === doc.id));

    expect(showing.map(({ label }) => label)).toEqual(['done']);

    for (const { count, data, label } of sections) {
      expect({ count, label }).toEqual({ count: data?.totalDocs ?? 0, label });
    }

    expect(result?.totalDocs).toBe(1);
  });

  it('still lists records whose select value is no longer an option', async () => {
    const stale = await create('items', { status: 'todo', title: 'stale' });
    await create('items', { status: 'doing', title: 'fresh' });

    await booted.payload.db.updateOne({
      collection: 'items',
      data: { status: 'archived' },
      id: stale.id,
      req,
    });

    const { result, sections } = await render('items', 'status');

    expect(result?.totalDocs).toBe(2);
    expect(summary(sections)).toEqual(['To do:0', 'Doing:1', 'done:0', 'archived:1']);
    expect(sections[3].data?.docs.map(({ id }) => id)).toEqual([stale.id]);
  });

  it('labels select groups with their translated option labels', async () => {
    const { sections } = await render('items', 'status');

    expect(sections.map(({ label }) => label)).toEqual(['To do', 'Doing', 'done']);
  });

  it('offers "+ Add" only in groups the user can create the group field for', async () => {
    const fieldPermissions = {
      locked: { read: true, update: true },
      status: true,
      title: true,
    };

    const locked = await render('items', 'locked', { fieldPermissions });
    const status = await render('items', 'status', { fieldPermissions });

    expect(locked.sections.map(({ canCreate }) => canCreate)).toEqual([false, false]);
    expect(status.sections.map(({ canCreate }) => canCreate)).toEqual([true, true, true]);
  });

  it('labels relationship groups by title, with counts equal to rows and the id as prefill', async () => {
    const ada = await create('people', { name: 'Ada' });
    const bob = await create('people', { name: 'Bob' });
    await create('items', { owner: ada.id, title: 'a1' });
    await create('items', { owner: ada.id, title: 'a2' });
    await create('items', { owner: bob.id, title: 'b1' });
    await create('items', { title: 'none' });

    const { sections } = await render('items', 'owner');

    expect(summary(sections)).toEqual(['Ada:2', 'Bob:1', 'No value:1']);
    expect(sections.map(({ data }) => data?.totalDocs ?? 0)).toEqual(
      sections.map(({ count }) => count),
    );
    expect(sections[0].prefill).toEqual({ owner: ada.id });
    expect(sections[2].prefill).toBeUndefined();
  });

  it('pages text groups by list size, "No value" last on the last page and after a descending sort', async () => {
    for (const city of ['Austin', 'Boston', 'Chicago', 'Denver', 'Austin']) {
      await create('items', { city, title: `t-${city}` });
    }

    await create('items', { title: 'nowhere' });

    const page1 = await render('items', 'city', { limit: 2 });
    const page3 = await render('items', 'city', { limit: 2, query: { page: '3' } });
    const descending = await render('items', '-city');

    expect(summary(page1.sections)).toEqual(['Austin:2', 'Boston:1']);
    expect(page1.result?.pagedGroups).toBe(true);
    expect(page1.result?.totalDocs).toBe(6);
    expect(page3.sections.map(({ label }) => label)).toEqual(['No value']);
    expect(descending.sections.map(({ label }) => label)).toEqual([
      'Denver',
      'Chicago',
      'Boston',
      'Austin',
      'No value',
    ]);
  });

  it('falls back for paths it cannot group by, and groups nested and hasMany selects', async () => {
    await create('items', { meta: { kind: 'b' }, tags: ['red', 'blue'], title: 'nested' });
    await create('items', { tags: ['red'], title: 'red' });

    expect((await render('items', 'nope')).result).toBeUndefined();
    expect((await render('items', 'meta')).result).toBeUndefined();

    const nested = await render('items', 'meta.kind');

    expect(summary(nested.sections)).toEqual(['a:0', 'b:1', 'No value:1']);
    expect(nested.sections[1].prefill).toEqual({ meta: { kind: 'b' } });

    const tags = await render('items', 'tags');

    expect(summary(tags.sections)).toEqual(['red:2', 'blue:1']);
    expect(tags.sections[0].prefill).toEqual({ tags: ['red'] });
  });
});
