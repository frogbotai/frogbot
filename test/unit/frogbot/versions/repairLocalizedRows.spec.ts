import type { Block, CollectionConfig, Field } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  needsLocalizedRowRepair,
  repairLocalizedRows,
} from '../../../../packages/frogbot/src/versions/repairLocalizedRows.js';

const intl: Block = {
  slug: 'intl',
  fields: [
    { name: 'text', type: 'text', localized: true },
    { name: 'size', type: 'text' },
  ],
};

const fields: Field[] = [
  { name: 'title', type: 'text', localized: true },
  { name: 'layout', type: 'blocks', blocks: [intl] },
  { name: 'refs', type: 'blocks', blocks: ['intl'] },
  {
    type: 'tabs',
    tabs: [
      {
        label: 'Items',
        fields: [
          {
            name: 'items',
            type: 'array',
            fields: [{ name: 'label', type: 'text', localized: true }],
          },
        ],
      },
    ],
  },
  {
    name: 'sections',
    type: 'array',
    fields: [{ name: 'content', type: 'blocks', blocks: [intl] }],
  },
];

const row = (id: string, en: string, es?: string) => ({
  id,
  blockType: 'intl',
  size: id,
  text: es === undefined ? { en } : { en, es },
});

const repair = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  repairLocalizedRows({ fields, blocks: [intl], before, after, locales: ['es'] });

describe('repairLocalizedRows', () => {
  it('re-pairs the other locale by row id in blocks, block references, arrays in tabs and nested blocks', () => {
    const before = {
      layout: [row('m1', 'Hello', 'Hola'), row('m2', 'Bye', 'Adios')],
      refs: [row('r1', 'A', 'a'), row('r2', 'B', 'b')],
      items: [
        { id: 'i1', label: { en: 'One', es: 'Uno' } },
        { id: 'i2', label: { en: 'Two', es: 'Dos' } },
      ],
      sections: [{ id: 's1', content: [row('n1', 'Up', 'Arriba'), row('n2', 'Down', 'Abajo')] }],
    };

    const after = {
      title: { en: 'Page', es: 'Pagina' },
      layout: [row('m2', 'Bye', 'Hola'), row('m1', 'Hello', 'Adios')],
      refs: [row('r2', 'B', 'a'), row('r1', 'A', 'b')],
      items: [
        { id: 'i2', label: { en: 'Two', es: 'Uno' } },
        { id: 'i1', label: { en: 'One', es: 'Dos' } },
      ],
      sections: [{ id: 's1', content: [row('n2', 'Down', 'Arriba'), row('n1', 'Up', 'Abajo')] }],
    };

    expect(repair(before, after)).toEqual({
      layout: [row('m2', 'Bye', 'Adios'), row('m1', 'Hello', 'Hola')],
      refs: [row('r2', 'B', 'b'), row('r1', 'A', 'a')],
      items: [
        { id: 'i2', label: { en: 'Two', es: 'Dos' } },
        { id: 'i1', label: { en: 'One', es: 'Uno' } },
      ],
      sections: [{ id: 's1', content: [row('n2', 'Down', 'Abajo'), row('n1', 'Up', 'Arriba')] }],
    });
  });

  it('gives a row with no match in the pre-write row no other-locale value', () => {
    const before = { layout: [row('m1', 'Hello', 'Hola'), row('m2', 'Bye', 'Adios')] };
    const after = { layout: [row('m3', 'New', 'Hola'), row('m2', 'Bye', 'Adios')] };

    expect(repair(before, after)).toEqual({
      layout: [row('m3', 'New'), row('m2', 'Bye', 'Adios')],
    });
  });

  it('restores a locale Payload dropped when the row moved past the old length', () => {
    const before = { layout: [row('m1', 'Hello', 'Hola')] };
    const after = { layout: [row('m3', 'New', 'Hola'), row('m1', 'Hello')] };

    expect(repair(before, after)).toEqual({
      layout: [row('m3', 'New'), row('m1', 'Hello', 'Hola')],
    });
  });

  it('restores a localized field Payload dropped from a row entirely', () => {
    const before = { layout: [{ id: 'm1', blockType: 'intl', size: 'm1', text: { es: 'Hola' } }] };
    const after = {
      layout: [row('m3', 'New'), { id: 'm1', blockType: 'intl', size: 'm1' }],
    };

    expect(repair(before, after)).toEqual({
      layout: [row('m3', 'New'), { id: 'm1', blockType: 'intl', size: 'm1', text: { es: 'Hola' } }],
    });
  });

  it('returns null when every row already has its own values', () => {
    const before = { layout: [row('m1', 'Hello', 'Hola')] };

    expect(repair(before, { layout: [row('m1', 'Hi', 'Hola')] })).toBeNull();
  });

  it('touches only the locales it is given', () => {
    const before = { layout: [row('m1', 'Hello', 'Hola'), row('m2', 'Bye', 'Adios')] };
    const after = { layout: [row('m2', 'Bye', 'Hola'), row('m1', 'Hello', 'Adios')] };

    expect(repairLocalizedRows({ fields, blocks: [intl], before, after, locales: [] })).toBeNull();
  });
});

describe('needsLocalizedRowRepair', () => {
  const collection = (overrides: Partial<CollectionConfig>): CollectionConfig => ({
    slug: 'pages',
    versions: { drafts: true },
    fields,
    ...overrides,
  });

  it('is true for a drafts collection with localized fields inside rows', () => {
    expect(needsLocalizedRowRepair(collection({}), [intl])).toBe(true);
  });

  it('follows block references', () => {
    const refsOnly: Field[] = [{ name: 'refs', type: 'blocks', blocks: ['intl'] }];

    expect(needsLocalizedRowRepair(collection({ fields: refsOnly }), [intl])).toBe(true);
    expect(needsLocalizedRowRepair(collection({ fields: refsOnly }), [])).toBe(false);
  });

  it('is false without drafts', () => {
    expect(needsLocalizedRowRepair(collection({ versions: true }), [intl])).toBe(false);
    expect(needsLocalizedRowRepair(collection({ versions: undefined }), [intl])).toBe(false);
  });

  it('is false when localized fields sit only outside rows or in a localized row field', () => {
    const outside: Field[] = [
      { name: 'title', type: 'text', localized: true },
      { name: 'layout', type: 'blocks', blocks: [intl], localized: true },
      { name: 'plain', type: 'array', fields: [{ name: 'size', type: 'text' }] },
    ];

    expect(needsLocalizedRowRepair(collection({ fields: outside }), [intl])).toBe(false);
  });
});
