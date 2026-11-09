import {
  aiField,
  autonumberField,
  barcodeField,
  type CollectionConfig,
  durationField,
  moneyField,
  percentField,
  phoneField,
  ratingField,
  urlField,
} from 'frogbot';

import { cellDraftsSlug, cellKindsSlug, tagsSlug } from '../shared';

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
    views: [{ type: 'list', defaultFields: ['title', 'note'], editable: ['note'] }],
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'note', type: 'text' },
  ],
};
