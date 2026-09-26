import { NotFound } from 'payload';

import type { DocID } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { resolveChannelLabel } from '../channelLabel.js';
import type { ChatDocument } from '../findChat.js';
import { TurnError } from '../turn/errors.js';

export type WritableChat = Pick<ChatDocument, 'user' | 'channel' | 'channelKey' | 'channelThread'>;

export type CanWriteChatProps = {
  req: FrogBotRequest;
  chat: WritableChat;
};

export function canWriteChat({ req, chat }: CanWriteChatProps): boolean {
  if (!chat.channelKey) return chatOwnerId(chat) === (req.user?.id ?? null);

  const channel = req.context.channel;

  return (
    !!channel &&
    channel.piece === chat.channel &&
    channel.threadId === chat.channelThread?.thread.id
  );
}

export function assertCanWriteChat({ req, chat }: CanWriteChatProps): void {
  if (canWriteChat({ req, chat })) return;

  if (!chat.channelKey) throw new NotFound(req.t);

  const label = resolveChannelLabel({ req, chat }) ?? 'a channel';

  throw new TurnError(
    'channel-chat',
    `This conversation happens in ${label}. Continue it there, or branch it into a new chat.`,
  );
}

export function chatOwnerId(chat: Pick<ChatDocument, 'user'>): DocID | null {
  return typeof chat.user === 'object' && chat.user !== null ? chat.user.id : (chat.user ?? null);
}
