import type { ClientCollectionConfig, ClientField, SanitizedCollectionConfig } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import {
  clampPanelWidth,
  findPanelField,
  getPanelSettings,
  omitPanelFields,
  resolvePropertyPaths,
  resolveTitlePath,
} from '../../../../../packages/ui/src/admin/views/panel/config.js';
import { redirectRecordParam } from '../../../../../packages/ui/src/admin/views/panel/redirectRecord.js';

const fields: ClientField[] = [
  { name: 'title', type: 'text' },
  { name: 'status', type: 'select', admin: { position: 'sidebar' } },
  { type: 'row', fields: [{ name: 'due', type: 'date' }] },
  { name: 'dates', type: 'group', fields: [{ name: 'start', type: 'date' }] },
  {
    type: 'tabs',
    tabs: [
      { label: 'Main', fields: [{ name: 'notes', type: 'textarea' }] },
      { name: 'meta', label: 'Meta', fields: [{ name: 'owner', type: 'text' }] },
    ],
  },
] as never;

const names = (list: ClientField[]): unknown =>
  list.map((field) =>
    'tabs' in field
      ? field.tabs.map((tab) => names(tab.fields))
      : 'fields' in field
        ? names(field.fields)
        : 'name' in field
          ? field.name
          : field.type,
  );

const collection = (admin: Record<string, unknown>): ClientCollectionConfig =>
  ({ admin, fields, slug: 'tasks' }) as never;

describe('record panel fields', () => {
  it.each([
    ['title', 'title', ''],
    ['due', 'due', ''],
    ['dates.start', 'start', 'dates'],
    ['notes', 'notes', ''],
    ['meta.owner', 'owner', 'meta'],
    ['dates', 'dates', ''],
  ])('finds %s through rows, groups and tabs', (path, name, parentPath) => {
    const found = findPanelField(fields, path);

    expect(found && 'name' in found.field ? found.field.name : undefined).toBe(name);
    expect(found?.parentPath).toBe(parentPath);
  });

  it('finds nothing for a missing or partial path', () => {
    expect(findPanelField(fields, 'missing')).toBeUndefined();
    expect(findPanelField(fields, 'title.extra')).toBeUndefined();
    expect(findPanelField(fields, 'owner')).toBeUndefined();
  });

  it('leaves the title and the properties out of the form, wherever they sit', () => {
    const omitted = omitPanelFields(fields, new Set(['title', 'due', 'dates.start', 'meta.owner']));

    expect(names(omitted)).toEqual(['status', [], [], [['notes'], []]]);
  });

  it('defaults the properties to the sidebar fields, and keeps configured ones in order', () => {
    expect(resolvePropertyPaths(collection({}), { width: 560 })).toEqual(['status']);
    expect(
      resolvePropertyPaths(collection({}), { properties: ['due', 'status'], width: 560 }),
    ).toEqual(['due', 'status']);
  });

  it('edits only a text-like useAsTitle in place', () => {
    expect(resolveTitlePath(collection({ useAsTitle: 'title' }))).toBe('title');
    expect(resolveTitlePath(collection({ useAsTitle: 'due' }))).toBeUndefined();
    expect(resolveTitlePath(collection({ useAsTitle: 'id' }))).toBeUndefined();
    expect(resolveTitlePath(collection({}))).toBeUndefined();
  });

  it('reads the panel settings from the client config, on by default', () => {
    expect(getPanelSettings(collection({}))).toEqual({ properties: undefined, width: 560 });
    expect(getPanelSettings(collection({ custom: { frogbot: { panel: false } } }))).toBe(false);
    expect(
      getPanelSettings(collection({ custom: { frogbot: { panel: { width: 700 } } } })),
    ).toEqual({ properties: undefined, width: 700 });
  });

  it('keeps a dragged width between 400 and 960 px', () => {
    expect(clampPanelWidth(120)).toBe(400);
    expect(clampPanelWidth(612.4)).toBe(612);
    expect(clampPanelWidth(2000)).toBe(960);
  });
});

describe('redirectRecordParam', () => {
  const config = (panel: unknown) =>
    ({ admin: { custom: { frogbot: { panel } } }, slug: 'notes' }) as SanitizedCollectionConfig;

  it('sends ?record to the edit page only when the panel is off', () => {
    const redirect = vi.fn();

    redirectRecordParam({
      collectionConfig: config(false),
      record: '4 2',
      redirect,
    });

    redirectRecordParam({
      collectionConfig: config({ width: 560 }),
      record: '9',
      redirect,
    });

    redirectRecordParam({
      collectionConfig: config(false),
      record: undefined,
      redirect,
    });

    expect(redirect.mock.calls).toEqual([['/collections/notes/4%202']]);
  });
});
