import { NotFound } from 'payload';

import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import type { ChannelChatAccess } from './channelAccess.js';
import { hasChannelChatAccess } from './channelAccess.js';
import { messagesConfig } from './turn/messages.js';

export type ChatDocument = {
  id: DocID;
  user?: { id: DocID } | DocID | null;
  agent?: string | null;
  channelKey?: string | null;
};

export async function findChat({
  req,
  agentSlug,
  chatId,
  channelAccess,
}: {
  req: FrogBotRequest;
  agentSlug?: string;
  chatId: DocID;
  channelAccess?: ChannelChatAccess;
}): Promise<ChatDocument> {
  const chat = (await req.frogbot.findByID({
    collection: messagesConfig(req).chatsSlug,
    id: chatId,
    depth: 0,
    req,
    overrideAccess: true,
  })) as ChatDocument;

  const ownerId = typeof chat.user === 'object' && chat.user !== null ? chat.user.id : chat.user;
  const allowed = channelAccess
    ? hasChannelChatAccess({
        access: channelAccess,
        req,
        agentSlug: agentSlug ?? chat.agent ?? '',
        chat,
      })
    : (ownerId ?? null) === (req.user?.id ?? null) && !(chat.channelKey && ownerId == null);

  if (!allowed) throw new NotFound(req.t);

  return chat;
}
