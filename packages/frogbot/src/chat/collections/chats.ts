import type { Access, CollectionAccess } from '../../collections/config/types.js';
import type { CollectionConfig } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';

export type DefaultChatsCollectionProps = {
  slug: string;
  userSlug: string;
  access?: CollectionAccess;
};

function userID(req: FrogBotRequest): number | string | undefined {
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
      views: [
        {
          type: 'list',
          defaultFields: ['title', 'user', 'agent', 'channel', 'lastMessageAt'],
        },
      ],
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
      {
        name: 'channel',
        type: 'text',
        index: true,
        admin: { components: { Cell: '@frogbotai/next/client#ChannelCell' } },
      },
      { name: 'externalId', type: 'text', index: true },
      { name: 'channelKey', type: 'text', unique: true, admin: { hidden: true } },
      {
        name: 'channelThread',
        type: 'json',
        admin: { hidden: true },
        typescriptSchema: [() => ({ tsType: "import('frogbot').ChannelThreadReference" })],
      },
      { name: 'lastMessageAt', type: 'date', index: true },
      {
        name: 'todos',
        type: 'json',
        typescriptSchema: [() => ({ tsType: "import('frogbot/tools').TodoItem[]" })],
      },
    ],
  };
}
