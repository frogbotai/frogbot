import {
  aiField,
  autonumberField,
  barcodeField,
  type CollectionConfig,
  colorField,
  durationField,
  moneyField,
  percentField,
  phoneField,
  ratingField,
  urlField,
} from 'frogbot';

import { cellAccessSlug, cellDraftsSlug, cellKindsSlug, tagsSlug } from '../shared';

export const cellKinds: CollectionConfig = {
  slug: cellKindsSlug,
  admin: {
    useAsTitle: 'title',
    views: [
      {
        type: 'list',
        defaultFields: [
          'title',
          'budget',
          'progress',
          'score',
          'timeSpent',
          'website',
          'phone',
          'sku',
          'color',
          'blurb',
          'number',
          'locked',
          'secret',
          'tags',
        ],
        editable: true,
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    moneyField({ name: 'budget' }),
    percentField({ name: 'progress', precision: 1 }),
    ratingField({ name: 'score' }),
    durationField({ name: 'timeSpent', format: 'h:mm' }),
    urlField({ name: 'website' }),
    phoneField({ name: 'phone' }),
    barcodeField({ name: 'sku' }),
    colorField({ name: 'color' }),
    aiField({
      name: 'blurb',
      inputs: ['title'],
      model: 'browser/questioner',
      prompt: 'Describe this row in one sentence.',
    }),
    autonumberField({ name: 'number' }),
    { name: 'locked', type: 'text', admin: { readOnly: true } },
    { name: 'secret', type: 'text', access: { update: () => false } },
    { name: 'tags', type: 'relationship', relationTo: tagsSlug, hasMany: true },
  ],
};

export const cellDrafts: CollectionConfig = {
  slug: cellDraftsSlug,
  admin: {
    useAsTitle: 'title',
    views: [
      { type: 'list', defaultFields: ['title', 'note', 'extra'], editable: ['note', 'extra'] },
    ],
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'note', type: 'text' },
    { name: 'extra', type: 'text', admin: { condition: (data) => Boolean(data?.title) } },
  ],
};

export const cellAccess: CollectionConfig = {
  slug: cellAccessSlug,
  access: { update: () => ({ open: { equals: true } }) },
  admin: {
    useAsTitle: 'title',
    views: [
      {
        type: 'list',
        defaultFields: ['title', 'address.city', 'note'],
        editable: ['address.city', 'note'],
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'open', type: 'checkbox', defaultValue: true },
    { name: 'archived', type: 'checkbox' },
    {
      name: 'address',
      type: 'group',
      fields: [
        { name: 'country', type: 'text' },
        {
          name: 'city',
          type: 'text',
          admin: { condition: (_, siblingData) => siblingData?.country === 'US' },
        },
      ],
    },
    { name: 'note', type: 'text', access: { update: ({ doc }) => !doc?.archived } },
  ],
};
