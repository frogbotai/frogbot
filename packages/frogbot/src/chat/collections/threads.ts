import type { Access } from '../../types/access.js';
import type { CollectionConfig } from '../../types/collection.js';
import type { FrogbotRequest } from '../../types/request.js';

export type DefaultThreadsCollectionProps = {
  slug: string;
  userSlug: string;
};

function userID(req: FrogbotRequest): number | string | undefined {
  return (req.user as { id?: number | string } | null)?.id;
}

const owner: Access = ({ req }) => {
  const id = userID(req);
  return id !== undefined ? { user: { equals: id } } : false;
};

export function defaultThreadsCollection({ slug, userSlug }: DefaultThreadsCollectionProps): CollectionConfig {
  return {
    slug,
    trash: true,
    admin: {
      group: 'Chat',
      useAsTitle: 'title',
      defaultColumns: ['title', 'user', 'agent', 'lastMessageAt'],
    },
    access: {
      create: ({ req }) => !!req.user,
      read: owner,
      update: owner,
      delete: owner,
    },
    fields: [
      { name: 'title', type: 'text' },
      {
        name: 'user',
        type: 'relationship',
        relationTo: userSlug,
        index: true,
        hooks: {
          beforeChange: [({ req, value }) => value ?? userID(req)],
        },
      },
      { name: 'agent', type: 'text', index: true },
      { name: 'lastMessageAt', type: 'date', index: true },
    ],
  };
}
