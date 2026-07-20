// Marker-based resolver for chat collections:
//   - `thread: true` / `message: true` marks a collection as the thread
//     or message store — FrogBot merges its default fields in; the slug
//     stays the user's
//   - no marked collection → inject the default (`threads` / `messages`),
//     mirroring Payload's `defaultUserCollection` injection
//   - persistence is on whenever agents are configured or a collection
//     is marked; there is no opt-out

import type { CollectionConfig } from '../types/collection.js';
import type { FrogbotConfig } from '../types/config.js';
import type { SanitizedChatConfig } from '../types/chat.js';
import { defaultMessagesCollection } from './collections/messages.js';
import { defaultThreadsCollection } from './collections/threads.js';
import { mergeChatCollection } from './mergeCollection.js';
import { resolveUserSlug } from './resolveUserSlug.js';

export const CHAT_ASSETS_SLUG = '_frogbot_chat_assets';

export const DEFAULT_THREADS_SLUG = 'threads';
export const DEFAULT_MESSAGES_SLUG = 'messages';

type ResolvedChat = {
  collections: CollectionConfig[];
  chat: SanitizedChatConfig;
};

function findChatCollection(collections: CollectionConfig[], marker: 'thread' | 'message'): CollectionConfig | undefined {
  const marked = collections.filter((c) => c[marker] === true);
  if (marked.length > 1) {
    throw new Error(
      `[frogbot] Multiple collections marked \`${marker}: true\` (${marked.map((c) => c.slug).join(', ')}). ` +
        'Mark exactly one.',
    );
  }
  return marked[0];
}

type ResolveChatCollectionProps = {
  collections: CollectionConfig[];
  existing: CollectionConfig | undefined;
  marker: 'thread' | 'message';
  defaultCollection: CollectionConfig;
  reservedFields: string[];
};

function resolveChatCollection({
  collections,
  existing,
  marker,
  defaultCollection,
  reservedFields,
}: ResolveChatCollectionProps): CollectionConfig[] {
  if (existing) {
    const out = [...collections];
    out[collections.indexOf(existing)] = mergeChatCollection({ user: existing, base: defaultCollection, reservedFields });
    return out;
  }

  const collision = collections.find((c) => c.slug === defaultCollection.slug);
  if (collision) {
    throw new Error(
      `[frogbot] Collection slug '${defaultCollection.slug}' conflicts with the default chat ${marker} collection. ` +
        `Add \`${marker}: true\` to adopt it, or rename it.`,
    );
  }
  return [...collections, defaultCollection];
}

export function resolveChatCollections(config: FrogbotConfig): ResolvedChat {
  if (config.collections.some((c) => c.slug === CHAT_ASSETS_SLUG)) {
    throw new Error(`[frogbot] Collection slug '${CHAT_ASSETS_SLUG}' is reserved for FrogBot chat assets.`);
  }

  const threadCollection = findChatCollection(config.collections, 'thread');
  const messageCollection = findChatCollection(config.collections, 'message');
  if (threadCollection && threadCollection === messageCollection) {
    throw new Error(
      `[frogbot] Collection '${threadCollection.slug}' is marked as both \`thread\` and \`message\`. Pick one.`,
    );
  }

  const enabled = config.agents !== undefined || threadCollection !== undefined || messageCollection !== undefined;
  if (!enabled) {
    return { collections: config.collections, chat: { enabled: false } };
  }

  const threadsSlug = threadCollection?.slug ?? DEFAULT_THREADS_SLUG;
  const messagesSlug = messageCollection?.slug ?? DEFAULT_MESSAGES_SLUG;
  if (threadsSlug === messagesSlug) {
    throw new Error(`[frogbot] Thread and message collections must differ (both '${threadsSlug}').`);
  }

  const userSlug = resolveUserSlug(config);
  const withThreads = resolveChatCollection({
    collections: config.collections,
    existing: threadCollection,
    marker: 'thread',
    defaultCollection: defaultThreadsCollection({ slug: threadsSlug, userSlug }),
    reservedFields: ['user'],
  });
  const collections = resolveChatCollection({
    collections: withThreads,
    existing: messageCollection,
    marker: 'message',
    defaultCollection: defaultMessagesCollection({ slug: messagesSlug, threadsSlug }),
    reservedFields: ['parts', 'thread'],
  });

  return { collections, chat: { enabled: true, threadsSlug, messagesSlug } };
}
