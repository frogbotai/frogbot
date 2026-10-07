import type { Access, CollectionAccess } from '../../collections/config/types.js';
import type { CollectionConfig } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { resolveChannelLabel } from '../channelLabel.js';

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

const readOnly = { create: () => false, update: () => false };

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
        access: readOnly,
        admin: {
          components: { Cell: '@frogbotai/next/client#FieldCell' },
          custom: { frogbot: { kind: { type: 'channel' } } },
        },
      },
      { name: 'externalId', type: 'text', index: true, access: readOnly },
      {
        name: 'channelKey',
        type: 'text',
        unique: true,
        access: readOnly,
        admin: { hidden: true },
      },
      {
        name: 'channelThread',
        type: 'json',
        access: readOnly,
        admin: { hidden: true },
        typescriptSchema: [() => ({ tsType: "import('frogbot').ChannelThreadReference" })],
      },
      {
        name: 'channelLabel',
        type: 'text',
        virtual: true,
        access: readOnly,
        admin: { hidden: true },
        hooks: {
          afterRead: [({ req, siblingData }) => resolveChannelLabel({ req, chat: siblingData })],
        },
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
