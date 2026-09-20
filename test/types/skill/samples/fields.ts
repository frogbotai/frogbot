import { FixedToolbarFeature, lexicalEditor } from '@frogbotai/richtext-lexical';
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import type { CollectionConfig, Field, GroupField, RichTextField, TextField } from 'frogbot';
import { buildConfig, slugField } from 'frogbot';

import { Media } from './collections.js';
import { createCoreConfig, Users } from './core-context.js';

export type { SerializedEditorState };

export const importedField: Field = slugField();

export const RecursivePages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      name: 'sections',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'eyebrow', type: 'text' },
          ],
        },
      ],
    },
  ],
};

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [{ name: 'title', type: 'text', required: true }, slugField()],
};

export const pageSlug = slugField({
  name: 'path',
  useAsSlug: 'title',
  slugify: ({ valueToSlugify }) =>
    typeof valueToSlugify === 'string'
      ? valueToSlugify
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
      : undefined,
});

export const richTextConfig = buildConfig({
  ...createCoreConfig(),
  editor: lexicalEditor({}),
  collections: [
    {
      slug: 'pages',
      fields: [{ name: 'content', type: 'richText' }],
    },
  ],
});

export const contentField: RichTextField = {
  name: 'content',
  type: 'richText',
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [...defaultFeatures, FixedToolbarFeature()],
  }),
};

export const FeaturePages: CollectionConfig = {
  slug: 'feature-pages',
  fields: [
    { name: 'enableFeature', type: 'checkbox' },
    {
      name: 'featureText',
      type: 'text',
      admin: {
        condition: (data, _siblingData, { user }) => {
          return Boolean(user) && data.enableFeature === true;
        },
      },
    },
    {
      name: 'hero',
      type: 'group',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: ['none', 'highImpact', 'mediumImpact', 'lowImpact'],
          defaultValue: 'lowImpact',
        },
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
          admin: {
            condition: (_data, siblingData) => {
              return siblingData.type === 'highImpact' || siblingData.type === 'mediumImpact';
            },
          },
        },
      ],
    },
  ],
};

export const conditionalCollections: CollectionConfig[] = [Media, FeaturePages];

export const computedVirtualField: TextField = {
  name: 'fullName',
  type: 'text',
  virtual: true,
  hooks: {
    afterRead: [
      ({ siblingData }) => {
        const firstName = typeof siblingData.firstName === 'string' ? siblingData.firstName : '';
        const lastName = typeof siblingData.lastName === 'string' ? siblingData.lastName : '';

        return `${firstName} ${lastName}`.trim();
      },
    ],
  },
};

export const pathVirtualField: TextField = {
  name: 'authorName',
  type: 'text',
  virtual: 'author.name',
};

export const Profiles: CollectionConfig = {
  slug: 'profiles',
  fields: [
    { name: 'firstName', type: 'text' },
    { name: 'lastName', type: 'text' },
    computedVirtualField,
  ],
};

export const AuthoredPosts: CollectionConfig = {
  slug: 'posts',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    pathVirtualField,
  ],
};

export const virtualCollections: CollectionConfig[] = [Users, Profiles, AuthoredPosts];

export type LinkFieldOptions = {
  appearances?: Array<'default' | 'outline'> | false;
  disableLabel?: boolean;
  overrides?: (field: GroupField) => GroupField;
};

export function link({
  appearances = ['default', 'outline'],
  disableLabel = false,
  overrides,
}: LinkFieldOptions = {}): GroupField {
  const field: GroupField = {
    name: 'link',
    type: 'group',
    admin: { hideGutter: true },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'type',
            type: 'radio',
            options: [
              { label: 'Internal link', value: 'reference' },
              { label: 'Custom URL', value: 'custom' },
            ],
            defaultValue: 'reference',
            admin: { layout: 'horizontal', width: '50%' },
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in new tab',
            admin: { width: '50%', style: { alignSelf: 'flex-end' } },
          },
        ],
      },
      {
        name: 'reference',
        type: 'relationship',
        relationTo: ['pages'],
        required: true,
        maxDepth: 1,
        admin: { condition: (_data, siblingData) => siblingData.type === 'reference' },
      },
      {
        name: 'url',
        type: 'text',
        label: 'Custom URL',
        required: true,
        admin: { condition: (_data, siblingData) => siblingData.type === 'custom' },
      },
    ],
  };

  if (!disableLabel) {
    field.fields.push({ name: 'label', type: 'text', required: true });
  }

  if (appearances !== false && appearances.length > 0) {
    field.fields.push({
      name: 'appearance',
      type: 'select',
      defaultValue: appearances[0],
      options: appearances.map((value) => ({
        label: value === 'default' ? 'Default' : 'Outline',
        value,
      })),
    });
  }

  return overrides ? overrides(field) : field;
}

export const LinkPages: CollectionConfig = {
  slug: 'pages',
  fields: [
    { name: 'title', type: 'text', required: true },
    link({ appearances: false }),
    link({
      appearances: ['outline'],
      disableLabel: true,
      overrides: (field) => ({
        ...field,
        name: 'cta',
        admin: { ...field.admin, description: 'Call to action button' },
      }),
    }),
  ],
};
