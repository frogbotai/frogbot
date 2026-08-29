// Marker-based resolver for chat collections:
//   - `chat: true` / `message: true` marks a collection as the chat
//     or message store — FrogBot merges its default fields in; the slug
//     stays the user's
//   - no marked collection → inject the default (`chats` / `messages`),
//     mirroring Payload's `defaultUserCollection` injection
//   - persistence is on whenever agents are configured or a collection
//     is marked; there is no opt-out

import { resolveMarkedCollection } from '../collections/config/resolveMarkedCollection.js';
import type { SanitizedChatConfig } from './types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { FrogbotConfig } from '../config/types.js';
import { defaultChatsCollection } from './collections/chats.js';
import { defaultMessagesCollection } from './collections/messages.js';
import { resolveUserSlug } from './resolveUserSlug.js';

export const CHAT_ASSETS_SLUG = '_frogbot_chat_assets';

export const DEFAULT_CHATS_SLUG = 'chats';
export const DEFAULT_MESSAGES_SLUG = 'messages';

type ResolvedChat = {
  collections: CollectionConfig[];
  chat: SanitizedChatConfig;
};

function findChatCollection(
  collections: CollectionConfig[],
  marker: 'chat' | 'message',
): CollectionConfig | undefined {
  const marked = collections.filter((c) => c[marker] === true);
  if (marked.length > 1) {
    throw new Error(
      `[frogbot] Multiple collections marked \`${marker}: true\` (${marked.map((c) => c.slug).join(', ')}). ` +
        'Mark exactly one.',
    );
  }
  return marked[0];
}

export function resolveChatCollections(config: FrogbotConfig): ResolvedChat {
  if (config.collections.some((c) => c.slug === CHAT_ASSETS_SLUG)) {
    throw new Error(
      `[frogbot] Collection slug '${CHAT_ASSETS_SLUG}' is reserved for FrogBot chat assets.`,
    );
  }

  const chatCollection = findChatCollection(config.collections, 'chat');
  const messageCollection = findChatCollection(config.collections, 'message');
  if (chatCollection && chatCollection === messageCollection) {
    throw new Error(
      `[frogbot] Collection '${chatCollection.slug}' is marked as both \`chat\` and \`message\`. Pick one.`,
    );
  }

  const enabled =
    config.agents !== undefined || chatCollection !== undefined || messageCollection !== undefined;
  if (!enabled) {
    return { collections: config.collections, chat: { enabled: false } };
  }

  const chatsSlug = chatCollection?.slug ?? DEFAULT_CHATS_SLUG;
  const messagesSlug = messageCollection?.slug ?? DEFAULT_MESSAGES_SLUG;
  if (chatsSlug === messagesSlug) {
    throw new Error(`[frogbot] Chat and message collections must differ (both '${chatsSlug}').`);
  }

  const userSlug = resolveUserSlug(config);
  const withChats = resolveMarkedCollection({
    collectionLabel: 'chat',
    collections: config.collections,
    existing: chatCollection,
    marker: 'chat',
    feature: 'chat persistence',
    defaultCollection: defaultChatsCollection({ slug: chatsSlug, userSlug }),
    reservedFields: ['user'],
  });
  const collections = resolveMarkedCollection({
    collectionLabel: 'chat message',
    collections: withChats,
    existing: messageCollection,
    marker: 'message',
    feature: 'chat persistence',
    defaultCollection: defaultMessagesCollection({ slug: messagesSlug, chatsSlug }),
    reservedFields: ['id', 'parts', 'chat'],
  });

  return { collections, chat: { enabled: true, chatsSlug, messagesSlug } };
}
