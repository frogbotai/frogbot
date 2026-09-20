import { BlocksFeature, FixedToolbarFeature, lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig } from 'frogbot';

import {
  BannerBlock,
  CallToActionBlock,
  MentionBlock,
  TypedCodeBlock,
} from './__docs-samples__/ticket135/blocks/config';
import { DividerFeature } from './__docs-samples__/ticket135/custom-features/divider/feature.server';

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

export const Files: CollectionConfig = {
  slug: 'files',
  file: true,
  fields: [{ name: 'title', type: 'text' }],
};

export const SchemaMismatch: CollectionConfig = {
  slug: 'schema-mismatches',
  fields: [
    {
      name: 'mismatchedSchema',
      type: 'json',
      admin: {
        components: {
          Field: '/__docs-samples__/ticket135/rendering-on-demand#MismatchedSchemaField',
        },
      },
    },
  ],
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
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ blocks: [Callout], inlineBlocks: [InlineBadge] }),
        ],
      }),
    },
    {
      name: 'documentedBlocks',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({
            blocks: [
              {
                ...BannerBlock,
                fields: [
                  {
                    name: 'title',
                    type: 'text',
                    required: true,
                    defaultValue: 'Runtime banner',
                  },
                  {
                    name: 'style',
                    type: 'select',
                    defaultValue: 'info',
                    options: ['info', 'warning', 'error', 'success'],
                  },
                  {
                    name: 'content',
                    type: 'textarea',
                    required: true,
                    defaultValue: 'Persisted banner content',
                  },
                ],
              },
              {
                ...CallToActionBlock,
                fields: [
                  {
                    name: 'heading',
                    type: 'text',
                    required: true,
                    defaultValue: 'Server request block',
                  },
                  { name: 'link', type: 'text' },
                ],
                admin: {
                  components: {
                    Block: '/__docs-samples__/ticket135/blocks/server-components#BannerBlock',
                    Label: '/__docs-samples__/ticket135/blocks/server-components#BannerLabel',
                  },
                },
              },
            ],
            inlineBlocks: [
              {
                ...MentionBlock,
                fields: [
                  {
                    name: 'username',
                    type: 'text',
                    required: true,
                    defaultValue: 'frogbot',
                  },
                ],
                admin: {
                  components: {
                    Block: '/__docs-samples__/ticket135/blocks/components#MentionBlock',
                    Label: '/__docs-samples__/ticket135/blocks/components#MentionLabel',
                  },
                },
              },
            ],
          }),
        ],
      }),
    },
    {
      name: 'previewContent',
      type: 'json',
      admin: {
        components: {
          Field: '/__docs-samples__/ticket135/rendering-on-demand#PreviewContentField',
        },
      },
    },
    {
      name: 'controlledPreview',
      type: 'ui',
      admin: {
        components: {
          Field: '/__docs-samples__/ticket135/rendering-on-demand#ControlledEditor',
        },
      },
    },
    {
      name: 'viewContent',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({
            blocks: [
              {
                slug: 'banner',
                fields: [{ name: 'message', type: 'text', required: true }],
              },
            ],
            inlineBlocks: [
              {
                slug: 'badge',
                fields: [{ name: 'label', type: 'text', required: true }],
              },
            ],
          }),
        ],
        views: '/__docs-samples__/ticket135/views/views#postViews',
      }),
    },
    {
      name: 'typedCode',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ blocks: [TypedCodeBlock] }),
        ],
      }),
    },
    {
      name: 'dividerContent',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          DividerFeature(),
          FixedToolbarFeature(),
          ...defaultFeatures,
        ],
      }),
    },
  ],
};
