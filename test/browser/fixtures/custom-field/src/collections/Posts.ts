import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'color',
      type: 'text',
      admin: { components: { Field: '/components/ColorField#ColorField' } },
    },
    {
      name: 'note',
      type: 'text',
      admin: {
        components: { Field: '/components/OwnerNote#OwnerNote' },
        condition: (data) => Boolean(data.title),
      },
    },
  ],
};
