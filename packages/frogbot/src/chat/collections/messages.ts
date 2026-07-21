import type { Access } from '../../types/access.js';
import type { CollectionConfig } from '../../types/collection.js';

export type DefaultMessagesCollectionProps = {
  slug: string;
  threadsSlug: string;
};

const threadOwner: Access = ({ req }) => {
  const id = req.user?.id;
  return id !== undefined ? { 'thread.user': { equals: id } } : false;
};

export function defaultMessagesCollection({ slug, threadsSlug }: DefaultMessagesCollectionProps): CollectionConfig {
  return {
    slug,
    trash: true,
    admin: {
      group: 'Chat',
      defaultColumns: ['thread', 'role', 'createdAt'],
    },
    access: {
      create: ({ req }) => !!req.user,
      read: threadOwner,
      update: threadOwner,
      delete: threadOwner,
    },
    fields: [
      {
        name: 'thread',
        type: 'relationship',
        relationTo: threadsSlug,
        required: true,
        index: true,
      },
      {
        name: 'role',
        type: 'select',
        options: ['user', 'assistant', 'system'],
        required: true,
      },
      {
        name: 'parts',
        type: 'json',
        required: true,
        typescriptSchema: [() => ({ tsType: "import('frogbot').UIMessage['parts']" })],
      },
      { name: 'metadata', type: 'json' },
      {
        name: 'usage',
        type: 'group',
        access: {
          create: () => false,
          update: () => false,
        },
        fields: [
          { name: 'inputTokens', type: 'number' },
          { name: 'outputTokens', type: 'number' },
          { name: 'totalTokens', type: 'number' },
          { name: 'reasoningTokens', type: 'number' },
          { name: 'cachedInputTokens', type: 'number' },
          { name: 'model', type: 'text' },
          { name: 'provider', type: 'text' },
        ],
      },
    ],
  };
}
