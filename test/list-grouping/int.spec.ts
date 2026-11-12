import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { upsertPreferences } from '@payloadcms/ui/utilities/upsertPreferences';
import { createPayloadRequest, type PayloadRequest } from 'payload';
import type { ReactElement } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderGroupedTable } from '../../packages/ui/src/admin/views/List/groupedTable';
import { patchPreferenceHandler } from '../../packages/ui/src/admin/views/patchPreference';
import {
  clearStoredLimit,
  isDefaultLimit,
  readViewPreference,
  resolveViewSetup,
} from '../../packages/ui/src/admin/views/viewSetup';
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

  it('patches a preference into what is stored now, keeping a sort saved after the page loaded', async () => {
    const key = 'collection-items-view-list';
    const patch = (value: Record<string, unknown>) =>
      patchPreferenceHandler({ importMap: {}, key, patch: value, req } as Parameters<
        typeof patchPreferenceHandler
      >[0]);

    await patch({ widths: { title: 240 } });

    expect(await readViewPreference(req, key)).toEqual({ widths: { title: 240 } });

    await resolveViewSetup({
      collectionSlug: 'items',
      query: { sort: '-title', where: { title: { equals: 'one' } } },
      req,
      viewSlug: 'list',
    });

    await patch({ rowHeight: 'tall', summary: { title: 'count' } });
    await patch({ summary: null, widths: { title: 300 } });

    expect(await readViewPreference(req, key)).toEqual({
      rowHeight: 'tall',
      sort: '-title',
      where: { title: { equals: 'one' } },
      widths: { title: 300 },
    });
  });

  it('refuses a preference patch without a signed-in user or with a malformed patch', async () => {
    const call = (args: Record<string, unknown>) =>
      patchPreferenceHandler({ importMap: {}, ...args } as Parameters<
        typeof patchPreferenceHandler
      >[0]);

    const signedOut = await createPayloadRequest({ payload: booted.payload });

    await expect(call({ key: 'k', patch: { a: 1 }, req: signedOut })).rejects.toThrow();
    await expect(call({ key: 'k', patch: [1], req })).rejects.toThrow();
    await expect(call({ key: '', patch: { a: 1 }, req })).rejects.toThrow();
    expect(await readViewPreference(req, 'k')).toBeUndefined();
  });

  it('saves a page size only when it differs from the default, so a new default reaches everyone', async () => {
    const listKey = 'collection-items';
    const viewKey = 'collection-items-view-list';

    const visit = async (query: Record<string, unknown>, defaultLimit: number) => {
      const payloadPrefs = await upsertPreferences<Record<string, unknown>>({
        key: listKey,
        req,
        value: { limit: query.limit ? Number(query.limit) : undefined, sort: query.sort },
      });

      const opensAt = Number(query.limit) || Number(payloadPrefs?.limit) || defaultLimit;
      const setup = await resolveViewSetup({
        collectionSlug: 'items',
        defaultLimit,
        query,
        req,
        viewSlug: 'list',
      });

      if (isDefaultLimit(query.limit, defaultLimit)) await clearStoredLimit(req, listKey);

      return { opensAt, redirect: setup.fresh ? setup.saved : undefined };
    };

    const stored = async () => ({
      list: (await readViewPreference(req, listKey))?.limit,
      view: (await readViewPreference(req, viewKey))?.limit,
    });

    expect(await visit({}, 50)).toEqual({ opensAt: 50, redirect: {} });
    expect(await stored()).toEqual({ list: undefined, view: undefined });

    await visit({ limit: '50' }, 50);

    expect(await stored()).toEqual({ list: undefined, view: undefined });

    await visit({ limit: '25', sort: '-title' }, 50);

    expect(await stored()).toEqual({ list: 25, view: '25' });
    expect(await visit({}, 50)).toEqual({
      opensAt: 25,
      redirect: { limit: '25', sort: '-title' },
    });

    await visit({ limit: '50', sort: 'title' }, 50);

    expect(await stored()).toEqual({ list: undefined, view: undefined });
    expect(await readViewPreference(req, listKey)).toMatchObject({ sort: 'title' });
    expect(await visit({}, 50)).toEqual({ opensAt: 50, redirect: { sort: 'title' } });

    await visit({ limit: '10' }, 10);

    expect(await stored()).toEqual({ list: undefined, view: undefined });
    expect((await visit({}, 50)).opensAt).toBe(50);
  });

  it('clears a saved page size from a gallery view and from visits at the default that race', async () => {
    const gallery = (query: Record<string, unknown>) =>
      resolveViewSetup({
        collectionSlug: 'items',
        defaultLimit: 25,
        query,
        req,
        viewSlug: 'gallery',
      });

    await gallery({ limit: '50' });
    await gallery({ limit: '25' });

    expect(await readViewPreference(req, 'collection-items-view-gallery')).toEqual({});

    const list = (query: Record<string, unknown>) =>
      resolveViewSetup({ collectionSlug: 'items', defaultLimit: 50, query, req, viewSlug: 'list' });

    await list({ limit: '25' });
    await Promise.all([list({ limit: '50' }), list({ limit: '50' })]);

    expect((await readViewPreference(req, 'collection-items-view-list'))?.limit).toBeUndefined();
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

  it("groups a value field by each record's latest draft value", async () => {
    const doc = await create('drafted', { _status: 'published', city: 'Austin', title: 'moved' });

    await booted.payload.update({
      collection: 'drafted',
      data: { city: 'Boston' },
      draft: true,
      id: doc.id,
      overrideAccess: true,
    });

    const { result, sections } = await render('drafted', 'city');

    expect(summary(sections)).toEqual(['Boston:1']);
    expect(sections[0].data?.docs.map(({ id }) => id)).toEqual([doc.id]);
    expect(result?.totalDocs).toBe(1);
  });

  it('gives a stray select value that only a newer draft holds its own group', async () => {
    const doc = await create('drafted', { _status: 'published', status: 'todo', title: 'stray' });
    const { docs } = await booted.payload.findVersions({
      collection: 'drafted',
      overrideAccess: true,
      where: { parent: { equals: doc.id } },
    });

    await booted.payload.db.updateVersion({
      collection: 'drafted',
      id: docs[0].id,
      req,
      versionData: { ...docs[0], version: { ...docs[0].version, status: 'archived' } },
    });

    const { sections } = await render('drafted', 'status');

    expect(summary(sections)).toEqual(['todo:0', 'doing:0', 'done:0', 'archived:1']);
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
