import type { PayloadRequest } from 'payload';

import type { Access, AccessResult, CollectionConfig } from '../../collections/config/types.js';
import type { Where } from '../../types/payload.js';
import type { FrogbotRequest } from '../../types/request.js';

export const CHAT_ASSETS_SLUG = 'frogbot-chat-assets';

export type DefaultChatAssetsCollectionProps = {
  chatsSlug: string;
  userSlug: string;
};

export function scopeWhere(where: Where, prefix: string): Where {
  const scoped: Where = {};

  for (const [key, value] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      scoped[key] = value.map((entry) => scopeWhere(entry, prefix));
    } else {
      scoped[`${prefix}.${key}`] = value;
    }
  }

  return scoped;
}

async function readableChats({
  req,
  chatsSlug,
}: {
  req: FrogbotRequest;
  chatsSlug: string;
}): Promise<AccessResult> {
  const payloadConfig = await req.frogbot.config._internal.payloadConfig;
  const chats = payloadConfig.collections.find(({ slug }) => slug === chatsSlug);
  const read = chats?.access.read;

  if (!read) return Boolean(req.user);

  return read({ req: req as unknown as PayloadRequest });
}

export function defaultChatAssetsCollection({
  chatsSlug,
  userSlug,
}: DefaultChatAssetsCollectionProps): CollectionConfig {
  const read: Access = async ({ req }) => {
    const clauses: Where[] = [];

    if (req.user) clauses.push({ owner: { equals: req.user.id } });

    const chats = await readableChats({ req, chatsSlug });

    if (chats === true) clauses.push({ chat: { exists: true } });
    else if (chats) clauses.push(scopeWhere(chats, 'chat'));

    if (clauses.length === 0) return false;

    return { or: clauses };
  };

  return {
    slug: CHAT_ASSETS_SLUG,
    upload: true,
    admin: { hidden: true },
    access: {
      create: ({ req }) => Boolean(req.user),
      read,
      update: () => false,
      delete: () => false,
    },
    fields: [
      {
        name: 'owner',
        type: 'relationship',
        relationTo: userSlug,
        index: true,
        hooks: {
          beforeChange: [({ req, value }) => value ?? req.user?.id],
        },
      },
      { name: 'chat', type: 'relationship', relationTo: chatsSlug, index: true },
    ],
  };
}
