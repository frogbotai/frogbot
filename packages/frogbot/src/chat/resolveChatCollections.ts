// Marker-based resolver for chat collections:
//   - `thread: true` / `message: true` marks a collection as the thread
//     or message store — FrogBot merges its default fields in; the slug
//     stays the user's
//   - no marked collection → inject the default (`threads` / `messages`),
//     mirroring Payload's `defaultUserCollection` injection
//   - persistence is on whenever agents are configured or a collection
//     is marked; there is no opt-out

import { resolveMarkedCollection } from '../collections/resolveMarkedCollection.js';
import type { SanitizedChatConfig } from '../types/chat.js';
import type { CollectionConfig } from '../types/collection.js';
import type { FrogbotConfig } from '../types/config.js';
import { defaultMessagesCollection } from './collections/messages.js';
import { defaultThreadsCollection } from './collections/threads.js';
import { resolveUserSlug } from './resolveUserSlug.js';

export const CHAT_ASSETS_SLUG = '_frogbot_chat_assets';

export const DEFAULT_THREADS_SLUG = 'threads';
export const DEFAULT_MESSAGES_SLUG = 'messages';

type ResolvedChat = {
  collections: CollectionConfig[];
  chat: SanitizedChatConfig;
};

function findChatCollection(
  collections: CollectionConfig[],
  marker: 'thread' | 'message',
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

  const threadCollection = findChatCollection(config.collections, 'thread');
  const messageCollection = findChatCollection(config.collections, 'message');
  if (threadCollection && threadCollection === messageCollection) {
    throw new Error(
      `[frogbot] Collection '${threadCollection.slug}' is marked as both \`thread\` and \`message\`. Pick one.`,
    );
  }

  const enabled =
    config.agents !== undefined ||
    threadCollection !== undefined ||
    messageCollection !== undefined;
  if (!enabled) {
    return { collections: config.collections, chat: { enabled: false } };
  }

  const threadsSlug = threadCollection?.slug ?? DEFAULT_THREADS_SLUG;
  const messagesSlug = messageCollection?.slug ?? DEFAULT_MESSAGES_SLUG;
  if (threadsSlug === messagesSlug) {
    throw new Error(
      `[frogbot] Thread and message collections must differ (both '${threadsSlug}').`,
    );
  }

  const userSlug = resolveUserSlug(config);
  const withThreads = resolveMarkedCollection({
    collectionLabel: 'chat thread',
    collections: config.collections,
    existing: threadCollection,
    marker: 'thread',
    feature: 'chat persistence',
    defaultCollection: defaultThreadsCollection({ slug: threadsSlug, userSlug }),
    reservedFields: ['user'],
  });
  const collections = resolveMarkedCollection({
    collectionLabel: 'chat message',
    collections: withThreads,
    existing: messageCollection,
    marker: 'message',
    feature: 'chat persistence',
    defaultCollection: defaultMessagesCollection({ slug: messagesSlug, threadsSlug }),
    reservedFields: ['id', 'parts', 'thread'],
  });

  return { collections, chat: { enabled: true, threadsSlug, messagesSlug } };
}
