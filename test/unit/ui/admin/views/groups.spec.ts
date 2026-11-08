import { describe, expect, it, vi } from 'vitest';

import {
  getGroupKey,
  toGroupCounts,
} from '../../../../../packages/ui/src/admin/views/groups/keys.js';
import {
  getGroupPage,
  layoutGroups,
  toggleCollapsed,
} from '../../../../../packages/ui/src/admin/views/groups/layout.js';
import {
  hasFixedGroups,
  resolveGroups,
} from '../../../../../packages/ui/src/admin/views/groups/resolve.js';

const stage = {
  name: 'stage',
  type: 'select',
  options: [
    { label: 'Lead', value: 'lead' },
    { label: 'Qualified', value: 'qualified' },
    { label: 'Won', value: 'won' },
  ],
} as never;

const req = { i18n: { t: (key: string) => key } } as never;

describe('list groups', () => {
  it('lists select groups in option order and checkbox groups as true then false', async () => {
    const groups = await resolveGroups({
      collectionSlug: 'deals',
      field: stage,
      path: 'stage',
      req,
    });

    expect(groups.map((group) => group.label)).toEqual(['Lead', 'Qualified', 'Won']);

    await expect(
      resolveGroups({
        collectionSlug: 'deals',
        field: { name: 'done', type: 'checkbox' } as never,
        path: 'done',
        req,
      }),
    ).resolves.toEqual([
      { key: 'boolean:true', label: 'general:true', value: true },
      { key: 'boolean:false', label: 'general:false', value: false },
    ]);
  });

  it('lists relationship groups from the values present under the view filter', async () => {
    const findDistinct = vi
      .fn()
      .mockResolvedValue({ values: [{ company: { id: 3, name: 'Acme' } }] });

    const where = { name: { like: 'Inbound' } };

    await expect(
      resolveGroups({
        collectionSlug: 'deals',
        field: { name: 'company', type: 'relationship', relationTo: 'companies' } as never,
        path: 'company',
        req: {
          payload: {
            config: { collections: [{ slug: 'companies', admin: { useAsTitle: 'name' } }] },
            findDistinct,
          },
        } as never,
        where,
      }),
    ).resolves.toEqual([{ key: 'number:3', label: 'Acme', value: 3 }]);
    expect(findDistinct).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, where }),
    );
  });

  it('treats only options as fixed groups', () => {
    expect(hasFixedGroups(stage)).toBe(true);
    expect(hasFixedGroups({ name: 'done', type: 'checkbox' } as never)).toBe(true);
    expect(hasFixedGroups({ name: 'company', type: 'relationship' } as never)).toBe(false);
  });

  it('shows every option with its count, empty ones with 0, and "No value" last', async () => {
    const groups = await resolveGroups({
      collectionSlug: 'deals',
      field: stage,
      path: 'stage',
      req,
    });

    const counts = toGroupCounts(
      [
        { group: { stage: 'won' }, values: { count: 2 } },
        { group: { stage: 'lead' }, values: { count: 5 } },
        { group: { stage: null }, values: { count: 1 } },
      ],
      'stage',
    );

    const layout = layoutGroups({
      counts,
      descending: false,
      fixed: true,
      groups,
      limit: 2,
      noValueLabel: 'No value',
      page: 1,
    });

    expect(layout.groups.map(({ count, label }) => [label, count])).toEqual([
      ['Lead', 5],
      ['Qualified', 0],
      ['Won', 2],
      ['No value', 1],
    ]);
    expect(layout.groups.at(-1)).toMatchObject({ key: getGroupKey(null), value: null });
    expect(layout.totalPages).toBe(1);
    expect(layout.groups.reduce((sum, group) => sum + group.count, 0)).toBe(8);
  });

  it('reverses a descending groupBy and hides "No value" when it has no records', async () => {
    const groups = await resolveGroups({
      collectionSlug: 'deals',
      field: stage,
      path: 'stage',
      req,
    });

    expect(
      layoutGroups({
        counts: { 'string:lead': 1 },
        descending: true,
        fixed: true,
        groups,
        limit: 10,
        noValueLabel: 'No value',
        page: 1,
      }).groups.map(({ label }) => label),
    ).toEqual(['Won', 'Qualified', 'Lead']);
  });

  it('pages value groups by the list page size and drops values without records', () => {
    const groups = [1, 2, 3, 4].map((id) => ({ key: getGroupKey(id), label: `C${id}`, value: id }));
    const counts = { 'number:1': 1, 'number:2': 4, 'number:4': 2, '': 3 };
    const page = (value: number) =>
      layoutGroups({
        counts,
        descending: false,
        fixed: false,
        groups,
        limit: 2,
        noValueLabel: 'No value',
        page: value,
      });

    expect(page(1).groups.map(({ label }) => label)).toEqual(['C1', 'C2']);
    expect(page(2).groups.map(({ label }) => label)).toEqual(['C4', 'No value']);
    expect(page(2).totalPages).toBe(2);
  });

  it('toggles collapsed keys, dropping anything malformed', () => {
    expect(toggleCollapsed(['a', 3, 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(toggleCollapsed(['a', 'c'], 'c', false)).toEqual(['a']);
    expect(toggleCollapsed(['c'], 'c', true)).toEqual(['c']);
    expect(toggleCollapsed(undefined, 'c', true)).toEqual(['c']);
  });

  it("reads a group's page from Payload's queryByGroup, as JSON or an object", () => {
    expect(getGroupPage(JSON.stringify({ 'string:lead': { page: 3 } }), 'string:lead')).toBe(3);
    expect(getGroupPage({ 'string:lead': { page: '2' } }, 'string:lead')).toBe(2);
    expect(getGroupPage({ 'string:lead': { page: 2 } }, 'string:won')).toBe(1);
    expect(getGroupPage('{not json', 'string:lead')).toBe(1);
    expect(getGroupPage({ 'string:lead': { page: -1 } }, 'string:lead')).toBe(1);
  });
});
