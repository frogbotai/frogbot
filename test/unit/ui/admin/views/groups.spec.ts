import { describe, expect, it, vi } from 'vitest';

import { getGroupKey } from '../../../../../packages/ui/src/admin/views/groups/keys.js';
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

  it('lays out every option in order, then stray values, then "No value" last', async () => {
    const groups = await resolveGroups({
      collectionSlug: 'deals',
      field: stage,
      path: 'stage',
      req,
    });

    const layout = layoutGroups({
      descending: false,
      fixed: true,
      groups,
      limit: 2,
      noValueLabel: 'No value',
      page: 1,
      strays: [{ key: getGroupKey('archived'), label: 'archived', value: 'archived' }],
    });

    expect(layout.groups.map(({ keepEmpty, label }) => [label, keepEmpty])).toEqual([
      ['Lead', true],
      ['Qualified', true],
      ['Won', true],
      ['archived', false],
      ['No value', false],
    ]);
    expect(layout.groups.at(-1)).toMatchObject({ key: getGroupKey(null), value: null });
    expect(layout.totalPages).toBe(1);
  });

  it('reverses a descending groupBy and leaves out "No value" when it has no records', async () => {
    const groups = await resolveGroups({
      collectionSlug: 'deals',
      field: stage,
      path: 'stage',
      req,
    });

    expect(
      layoutGroups({
        descending: true,
        fixed: true,
        groups,
        limit: 10,
        page: 1,
      }).groups.map(({ label }) => label),
    ).toEqual(['Won', 'Qualified', 'Lead']);
  });

  it('pages value groups by the list page size, "No value" on the last page', () => {
    const groups = [1, 2, 3].map((id) => ({ key: getGroupKey(id), label: `C${id}`, value: id }));
    const page = (value: number) =>
      layoutGroups({
        descending: false,
        fixed: false,
        groups,
        limit: 2,
        noValueLabel: 'No value',
        page: value,
      });

    expect(page(1).groups.map(({ label }) => label)).toEqual(['C1', 'C2']);
    expect(page(2).groups.map(({ keepEmpty, label }) => [label, keepEmpty])).toEqual([
      ['C3', false],
      ['No value', false],
    ]);
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
