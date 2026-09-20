import { BlocksFeature, lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig } from 'frogbot';

const InlineBadge = {
  slug: 'inlineBadge',
  labels: { plural: 'Inline badges', singular: 'Inline badge' },
  fields: [{ name: 'label', type: 'text' as const, required: true }],
};

const Callout = {
  slug: 'callout',
  labels: { plural: 'Callouts', singular: 'Callout' },
  fields: [
    { name: 'title', type: 'text' as const, required: true },
    {
      name: 'body',
      type: 'richText' as const,
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ inlineBlocks: [InlineBadge] }),
        ],
      }),
    },
  ],
};

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: { read: () => true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'content',
      type: 'richText',
      required: true,
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ blocks: [Callout], inlineBlocks: [InlineBadge] }),
        ],
      }),
    },
  ],
};
