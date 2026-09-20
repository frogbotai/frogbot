import type { Block, Field } from 'frogbot';
import { expect, test } from 'vitest';

import { fieldNames, visit } from '../../types/skill/samples/field-type-guards.js';

test('schema inspection reaches both tab shapes and inline and root-referenced blocks', () => {
  expect(fieldNames).toEqual(['title', 'description', 'hero', 'heading', 'layout', 'message']);
});

test('schema inspection reaches nested arrays, groups, rows, and collapsibles', () => {
  const fields: Field[] = [
    {
      name: 'items',
      type: 'array',
      fields: [
        {
          name: 'details',
          type: 'group',
          fields: [
            {
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      type: 'collapsible',
                      label: 'Advanced',
                      fields: [{ name: 'note', type: 'text' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  const types: string[] = [];

  visit({ fields, onField: (field) => types.push(field.type) });

  expect(types).toEqual(['array', 'group', 'group', 'row', 'collapsible', 'text']);
});

test('schema inspection terminates recursive block references without repeating fields', () => {
  const recursive: Block = {
    slug: 'recursive',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'children', type: 'blocks', blocks: [], blockReferences: ['recursive'] },
    ],
  };

  const fields: Field[] = [
    { name: 'layout', type: 'blocks', blocks: [], blockReferences: ['recursive'] },
  ];

  const names: string[] = [];

  visit({
    fields,
    blocks: [recursive],
    onField: (field) => {
      if ('name' in field && typeof field.name === 'string') names.push(field.name);
    },
  });

  expect(names).toEqual(['layout', 'title', 'children']);
});

test('schema inspection reports an unresolved root block instead of skipping it', () => {
  const fields: Field[] = [
    { name: 'layout', type: 'blocks', blocks: [], blockReferences: ['missing'] },
  ];

  expect(() => visit({ fields, onField: () => undefined })).toThrow(
    'Unknown root block reference: missing',
  );
});
