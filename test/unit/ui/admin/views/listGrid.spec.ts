import { describe, expect, it, vi } from 'vitest';

import {
  clampWidth,
  columnWidthsCss,
  readGridSettings,
} from '../../../../../packages/ui/src/admin/views/List/grid/grid.js';
import {
  applyPreferencePatch,
  PATCH_PREFERENCE,
  patchPreference,
} from '../../../../../packages/ui/src/admin/views/preferences.js';

describe('list grid settings', () => {
  it('clamps a column width to 60 to 800 pixels, rounded', () => {
    expect(clampWidth(12)).toBe(60);
    expect(clampWidth(60)).toBe(60);
    expect(clampWidth(240.6)).toBe(241);
    expect(clampWidth(800)).toBe(800);
    expect(clampWidth(5000)).toBe(800);
  });

  it('reads saved widths, dropping values that are not finite numbers and clamping the rest', () => {
    expect(
      readGridSettings({
        widths: {
          name: 320,
          amount: 20,
          stage: 'wide',
          owner: Number.NaN,
          closeDate: Number.POSITIVE_INFINITY,
          gone: 200,
        },
      }).widths,
    ).toEqual({ amount: 60, gone: 200, name: 320 });
  });

  it('reads no widths from a missing or malformed preference', () => {
    expect(readGridSettings(undefined)).toEqual({ rowHeight: 'default', widths: {} });
    expect(readGridSettings({ widths: [200] })).toEqual({ rowHeight: 'default', widths: {} });
  });

  it('reads the saved row height, and an unknown one as default', () => {
    expect(readGridSettings({ rowHeight: 'compact' }).rowHeight).toBe('compact');
    expect(readGridSettings({ rowHeight: 'tall' }).rowHeight).toBe('tall');
    expect(readGridSettings({ rowHeight: 'extra-tall' }).rowHeight).toBe('default');
    expect(readGridSettings({ rowHeight: 3 }).rowHeight).toBe('default');
  });

  it('sizes each resized column in one rule for every table kind, in the frogbot layer', () => {
    expect(columnWidthsCss({ name: 240, 'company.name': 120 })).toBe(
      '@layer frogbot{' +
        '.fb-list-grid :is([data-column="name"],[id="heading-name"],[class~="cell-name"])' +
        '{width:240px;min-width:240px;max-width:240px}' +
        '.fb-list-grid :is([data-column="company.name"],' +
        '[id="heading-company.name"],[class~="cell-company.name"],' +
        '[id="heading-company__name"],[class~="cell-company__name"])' +
        '{width:120px;min-width:120px;max-width:120px}' +
        '}',
    );
    expect(columnWidthsCss({})).toBe('');
  });

  it('escapes accessors so they cannot leave the selector or the style element', () => {
    const css = columnWidthsCss({ 'a"]{}</style><b': 100 });

    expect(css).not.toContain('</style>');
    expect(css).toContain('[data-column="a\\"]{}\\3c /style\\3e \\3c b"]');
  });
});

describe('preference patch', () => {
  const stored = {
    columns: [{ accessor: 'name', active: true }],
    groupBy: 'stage',
    limit: 25,
    sort: '-amount',
    summary: { amount: 'avg' },
    where: { stage: { equals: 'lead' } },
    widths: { name: 200 },
  };

  it('changes only the patched key and keeps the setup and other choices', () => {
    expect(applyPreferencePatch(stored, { widths: { name: 320 } })).toEqual({
      ...stored,
      widths: { name: 320 },
    });
    expect(applyPreferencePatch(stored, { rowHeight: 'tall' })).toEqual({
      ...stored,
      rowHeight: 'tall',
    });
  });

  it('removes a key patched to undefined or null', () => {
    const { summary: _summary, ...rest } = stored;

    expect(applyPreferencePatch(stored, { summary: undefined })).toEqual(rest);
    expect(applyPreferencePatch(stored, { summary: null })).toEqual(rest);
  });

  it('starts from an empty value when nothing usable is stored', () => {
    expect(applyPreferencePatch(undefined, { rowHeight: 'compact' })).toEqual({
      rowHeight: 'compact',
    });
    expect(applyPreferencePatch([1], { rowHeight: 'compact' })).toEqual({ rowHeight: 'compact' });
  });
});

describe('patchPreference', () => {
  it('sends the patch to the server to merge, removed keys as null, and never reads first', async () => {
    const fetch = vi.fn();
    const serverFunction = vi.fn(() => Promise.resolve());

    vi.stubGlobal('fetch', fetch);

    await patchPreference({
      key: 'collection-deals-view-list',
      patch: { rowHeight: undefined, widths: { company: 240 } },
      serverFunction,
    });

    vi.unstubAllGlobals();

    expect(fetch).not.toHaveBeenCalled();
    expect(serverFunction).toHaveBeenCalledWith({
      name: PATCH_PREFERENCE,
      args: {
        key: 'collection-deals-view-list',
        patch: { rowHeight: null, widths: { company: 240 } },
      },
    });
  });

  it('sends one patch per key at a time, in order, even after one fails', async () => {
    const order: string[] = [];
    let fail: (error: Error) => void = () => {};

    const serverFunction = vi.fn(({ args }: { args: Record<string, unknown> }) => {
      const { patch } = args as { patch: Record<string, unknown> };

      order.push(Object.keys(patch).join());

      return order.length === 1 ? new Promise((_, reject) => (fail = reject)) : Promise.resolve();
    });

    const first = patchPreference({ key: 'k', patch: { widths: {} }, serverFunction });
    const second = patchPreference({ key: 'k', patch: { rowHeight: 'tall' }, serverFunction });

    await Promise.resolve();

    expect(order).toEqual(['widths']);

    fail(new Error('offline'));

    await expect(first).rejects.toThrow('offline');

    await second;

    expect(order).toEqual(['widths', 'rowHeight']);
  });
});
