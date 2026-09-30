import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@frogbotai/plugin-seo/fields';
import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [],
};

export const Posts: CollectionConfig = {
  slug: 'posts',
  fields: [{ name: 'title', type: 'text', required: true }],
};

export const Media: CollectionConfig = {
  slug: 'media',
  upload: true,
  fields: [],
};

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [{ name: 'title', type: 'text', required: true }],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({ hasGenerateFn: true }),
            MetaDescriptionField({}),
            MetaImageField({ relationTo: Media.slug }),
            PreviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
  ],
};
