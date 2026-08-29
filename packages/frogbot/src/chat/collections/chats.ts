import type { Access, CollectionAccess } from '../../collections/config/types.js';
import type { CollectionConfig } from '../../collections/config/types.js';
import type { FrogbotRequest } from '../../types/request.js';

export type DefaultChatsCollectionProps = {
  slug: string;
  userSlug: string;
  access?: CollectionAccess;
};

function userID(req: FrogbotRequest): number | string | undefined {
  return req.user?.id;
}

const owner: Access = ({ req }) => {
  const id = userID(req);
  return id !== undefined ? { user: { equals: id } } : false;
};

export function defaultChatsCollection({
  slug,
  userSlug,
  access,
}: DefaultChatsCollectionProps): CollectionConfig {
  return {
    slug,
    trash: true,
    admin: {
      icon: 'bubble-chat',
      group: 'Chat',
      useAsTitle: 'title',
      defaultColumns: ['title', 'user', 'agent', 'lastMessageAt'],
    },
    access: {
      create: ({ req }) => !!req.user,
      read: owner,
      update: owner,
      delete: owner,
      ...access,
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
      {
        name: 'todos',
        type: 'json',
        typescriptSchema: [() => ({ tsType: "import('frogbot/tools').TodoItem[]" })],
      },
    ],
  };
}
