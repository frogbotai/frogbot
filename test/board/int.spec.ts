import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { draftsSlug, lockedSlug, tasksSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

type Task = { _order: string; id: number | string; status?: string; title: string };

describe(`board order [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'board');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  const create = async (title: string) => {
    const response = await booted.restClient.post<{ doc: Task }>(`/api/${tasksSlug}`, {
      status: 'todo',
      title,
    });

    expect(response.status).toBe(201);

    return response.body.doc;
  };

  const titles = async () => {
    const response = await booted.restClient.get<{ docs: Task[] }>(
      `/api/${tasksSlug}?sort=_order&limit=0`,
    );

    return response.body.docs.map(({ title }) => title);
  };

  it('puts every board on the collection order and adds new cards last', async () => {
    const a = await create('a');
    const b = await create('b');
    const c = await create('c');

    expect(a._order < b._order && b._order < c._order).toBe(true);
    expect(booted.payload.collections[tasksSlug].config.orderable).toBe(true);
    expect(
      booted.payload.collections[tasksSlug].config.admin.custom?.frogbot.views[1].orderField,
    ).toBe('_order');
    expect(await titles()).toEqual(['a', 'b', 'c']);
  });

  it('saves a reorder through Payload’s endpoint', async () => {
    const a = await create('a');
    await create('b');
    const c = await create('c');

    const response = await booted.restClient.post('/api/reorder', {
      collectionSlug: tasksSlug,
      docsToMove: [String(c.id)],
      newKeyWillBe: 'less',
      orderableFieldName: '_order',
      target: { id: String(a.id), key: a._order },
    });

    expect(response.status).toBe(200);
    expect(await titles()).toEqual(['c', 'a', 'b']);

    await create('d');

    expect(await titles()).toEqual(['c', 'a', 'b', 'd']);
  });

  it('counts drafts in the column totals when the board asks for drafts', async () => {
    const created = await booted.restClient.post(`/api/${draftsSlug}`, {
      status: 'todo',
      title: 'typed inline',
    });

    expect(created.status).toBe(201);

    const totals = async (draft?: boolean) => {
      const response = await booted.restClient.post<{
        groups: { group: { status: string }; values: { count: number } }[];
      }>(`/api/${draftsSlug}/aggregate`, {
        depth: 0,
        groupBy: 'status',
        values: { count: { count: true } },
        ...(draft ? { draft } : {}),
      });

      expect(response.status).toBe(200);

      return response.body.groups.map(({ group, values }) => [group.status, values.count]);
    };

    expect(await totals()).toEqual([]);
    expect(await totals(true)).toEqual([['todo', 1]]);
  });

  it('drops a group value the user cannot create', async () => {
    const created = await booted.restClient.post<{ doc: Task }>(`/api/${lockedSlug}`, {
      status: 'todo',
      title: 'typed inline',
    });

    expect(created.status).toBe(201);
    expect(created.body.doc.status ?? undefined).toBeUndefined();
  });
});
