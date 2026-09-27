import { BlocksFeature, lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  fields: [
    {
      name: 'content',
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
        views: '/collections/Posts/views#postViews',
      }),
    },
  ],
};
