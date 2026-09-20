import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig } from 'frogbot';

import { DividerFeature } from './divider/feature.server';

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [...defaultFeatures, DividerFeature()],
      }),
    },
  ],
};
