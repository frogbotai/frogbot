import type { Access, CollectionAccess } from '../../collections/config/types.js';
import type { CollectionConfig } from '../../collections/config/types.js';

export const MESSAGE_USAGE_CONTEXT_KEY = 'frogbotMessageUsage';

type MessageUsage = Record<string, unknown> & {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

function mergeUsage(previous: MessageUsage | undefined, next: MessageUsage): MessageUsage {
  const merged: MessageUsage = { ...previous, ...next };
  for (const key of [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'reasoningTokens',
    'cachedInputTokens',
  ] as const) {
    const value = (previous?.[key] ?? 0) + (next[key] ?? 0);
    if (value !== 0 || previous?.[key] !== undefined || next[key] !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

export type DefaultMessagesCollectionProps = {
  slug: string;
  chatsSlug: string;
  access?: CollectionAccess;
};

const chatOwner: Access = ({ req }) => {
  const id = req.user?.id;
  return id !== undefined ? { 'chat.user': { equals: id } } : false;
};

export function defaultMessagesCollection({
  slug,
  chatsSlug,
  access,
}: DefaultMessagesCollectionProps): CollectionConfig {
  return {
    slug,
    trash: true,
    admin: {
      icon: 'bubble-chat',
      group: 'Chat',
      views: [{ type: 'list', defaultFields: ['chat', 'role', 'createdAt'] }],
    },
    access: {
      create: ({ req }) => !!req.user,
      read: chatOwner,
      update: chatOwner,
      delete: chatOwner,
      ...access,
    },
    hooks: {
      beforeChange: [
        ({ context, data, originalDoc }) => {
          const usage = context[MESSAGE_USAGE_CONTEXT_KEY] as MessageUsage | undefined;
          if (usage) data.usage = mergeUsage(originalDoc?.usage as MessageUsage | undefined, usage);
          return data;
        },
      ],
    },
    fields: [
      { name: 'id', type: 'text', required: true },
      {
        name: 'chat',
        type: 'relationship',
        relationTo: chatsSlug,
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
