import { NotFound } from 'payload';

import type { ChannelThreadReference } from '../channels/types.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { assertCanWriteChat, chatOwnerId } from './access/canWriteChat.js';
import type { ChannelChatAccess } from './channelAccess.js';
import { hasChannelChatAccess } from './channelAccess.js';
import { messagesConfig } from './turn/messages.js';

export type ChatDocument = {
  id: DocID;
  user?: { id: DocID } | DocID | null;
  agent?: string | null;
  title?: string | null;
  channel?: string | null;
  channelKey?: string | null;
  channelThread?: ChannelThreadReference | null;
  channelLabel?: string | null;
};

type FindChatProps = {
  req: FrogBotRequest;
  agentSlug?: string;
  chatId: DocID;
  channelAccess?: ChannelChatAccess;
};

export async function findChat({
  req,
  agentSlug,
  chatId,
  channelAccess,
}: FindChatProps): Promise<ChatDocument> {
  const chat = (await req.frogbot.findByID({
    collection: messagesConfig(req).chatsSlug,
    id: chatId,
    depth: 0,
    req,
    overrideAccess: true,
  })) as ChatDocument;

  const ownerId = chatOwnerId(chat);
  const allowed = channelAccess
    ? hasChannelChatAccess({
        access: channelAccess,
        req,
        agentSlug: agentSlug ?? chat.agent ?? '',
        chat,
      })
    : ownerId === (req.user?.id ?? null) && !(chat.channelKey && ownerId == null);

  if (!allowed) throw new NotFound(req.t);

  return chat;
}

export async function findWritableChat(props: FindChatProps): Promise<ChatDocument> {
  const chat = await findChat(props);

  assertCanWriteChat({ req: props.req, chat });

  return chat;
}
