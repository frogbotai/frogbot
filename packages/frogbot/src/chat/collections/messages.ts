import type { Access, CollectionAccess, DocID } from '../../collections/config/types.js';
import type { CollectionConfig } from '../../collections/config/types.js';
import { canWriteChat } from '../access/canWriteChat.js';
import type { ChatDocument } from '../findChat.js';

export const MESSAGE_USAGE_CONTEXT_KEY = 'frogbotMessageUsage';

export type StoredMessageUsage = Record<string, unknown> & {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

export function mergeUsage(
  previous: StoredMessageUsage | null | undefined,
  next: StoredMessageUsage,
): StoredMessageUsage {
  const merged: StoredMessageUsage = { ...previous, ...next };

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

const chatWriter: Access = ({ req }) => {
  const id = req.user?.id;

  if (id === undefined || req.context.channel) return false;

  return { 'chat.user': { equals: id }, 'chat.channelKey': { exists: false } };
};

function createAccess(chatsSlug: string): Access {
  return async ({ req, data }) => {
    if (!req.user) return false;

    const chatId = relationID(data?.chat);

    if (chatId === undefined) return true;

    const chat = (await req.frogbot.findByID({
      collection: chatsSlug,
      id: chatId,
      depth: 0,
      disableErrors: true,
      req,
      overrideAccess: true,
    })) as ChatDocument | null;

    return !!chat && canWriteChat({ req, chat });
  };
}

function relationID(value: unknown): DocID | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value;

  if (typeof value === 'object' && value !== null && 'id' in value) {
    return relationID(value.id);
  }

  return undefined;
}

const readOnly = { create: () => false, update: () => false };

export function defaultMessagesCollection({
  slug,
  chatsSlug,
  access,
}: DefaultMessagesCollectionProps): CollectionConfig {
  return {
    slug,
    trash: true,
    // A message belongs to one position in one chat. Duplicating it would skip
    // the chat write rule, because create access runs before the source is merged.
    disableDuplicate: true,
    admin: {
      hidden: true,
      icon: 'message-square-text',
      views: [{ type: 'list', defaultFields: ['chat', 'role', 'createdAt'] }],
    },
    access: {
      create: createAccess(chatsSlug),
      read: chatOwner,
      update: chatWriter,
      delete: chatWriter,
      ...access,
    },
    hooks: {
      beforeChange: [
        ({ context, data, originalDoc }) => {
          const usage = context[MESSAGE_USAGE_CONTEXT_KEY] as StoredMessageUsage | undefined;
          if (usage) data.usage = mergeUsage(originalDoc?.usage as StoredMessageUsage, usage);
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
        access: { update: () => false },
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
        name: 'status',
        type: 'select',
        options: ['active', 'queued'],
        defaultValue: 'active',
        index: true,
        access: readOnly,
      },
      {
        name: 'delivery',
        type: 'select',
        options: ['queue', 'steer'],
        access: readOnly,
      },
      { name: 'model', type: 'text', access: readOnly },
      { name: 'reasoning', type: 'text', access: readOnly },
      {
        name: 'author',
        type: 'json',
        access: readOnly,
        typescriptSchema: [() => ({ tsType: "import('frogbot').TurnActor" })],
      },
      {
        name: 'settlements',
        type: 'json',
        access: readOnly,
        admin: { hidden: true },
        typescriptSchema: [
          () => ({ tsType: "Record<string, import('frogbot').ClientToolSettlement>" }),
        ],
      },
      {
        name: 'version',
        type: 'number',
        defaultValue: 0,
        access: readOnly,
        admin: { hidden: true },
      },
      {
        name: 'usage',
        type: 'group',
        access: readOnly,
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
