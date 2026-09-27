import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig, RichTextField } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  fields: [
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor({}),
    },
    {
      name: 'previewContent',
      type: 'json',
      admin: {
        components: {
          Field: '/components/PreviewContentField#PreviewContentField',
        },
      },
    },
  ],
};

export const onDemandEditorSchema: RichTextField = {
  name: 'onDemandEditorSchema',
  type: 'richText',
  editor: lexicalEditor({}),
  admin: {
    hidden: true,
  },
};
