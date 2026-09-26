import { createHash } from 'node:crypto';

import type { Thread } from 'chat';

import type { ChannelChatAccess } from '../chat/channelAccess.js';
import { createChannelChatAccess } from '../chat/channelAccess.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import type {
  ChannelConversationBinding,
  ChannelConversationIdentity,
  ChannelThreadReference,
} from './types.js';

export type ResolveChannelChatProps = {
  req: FrogBotRequest;
  identity: ChannelConversationIdentity;
  user: DocID | null;
  thread?: ChannelThreadReference;
};

export function channelConversationKey(identity: ChannelConversationIdentity): string {
  const tuple = [
    identity.agent,
    identity.piece,
    identity.account,
    identity.kind,
    identity.peer,
    identity.parent ?? '',
    identity.thread ?? '',
  ];

  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
}

export function channelThreadIdentity({
  binding,
  thread,
}: {
  binding: ChannelConversationBinding;
  thread: Pick<Thread, 'channelId' | 'id' | 'isDM'>;
}): ChannelConversationIdentity {
  return {
    agent: binding.agent.slug,
    piece: binding.instance.piece,
    account: binding.instance.slug,
    kind: thread.isDM ? 'direct' : 'thread',
    peer: thread.channelId,
    thread: thread.id,
  };
}

export function createChannelThreadAccess({
  binding,
  chatId,
  req,
  thread,
}: {
  binding: ChannelConversationBinding;
  chatId: DocID;
  req: FrogBotRequest;
  thread: Pick<Thread, 'channelId' | 'id' | 'isDM'>;
}): ChannelChatAccess {
  return createChannelChatAccess({
    req,
    agentSlug: binding.agent.slug,
    chatId,
    channelKey: channelConversationKey(channelThreadIdentity({ binding, thread })),
  });
}

export async function findChannelChat({
  req,
  identity,
}: {
  req: FrogBotRequest;
  identity: ChannelConversationIdentity;
}): Promise<{ id: DocID; channelThread?: unknown } | undefined> {
  const chat = req.frogbot.config.chat;

  if (!chat.enabled) return undefined;

  const result = await req.frogbot.find({
    collection: chat.chatsSlug,
    where: { channelKey: { equals: channelConversationKey(identity) } },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  return result.docs[0] as { id: DocID; channelThread?: unknown } | undefined;
}

export async function resolveChannelChat({
  req,
  identity,
  user,
  thread,
}: ResolveChannelChatProps): Promise<DocID> {
  const chat = req.frogbot.config.chat;

  if (!chat.enabled) {
    throw new Error('[frogbot] Channel conversations require chat persistence.');
  }

  const channelKey = channelConversationKey(identity);
  const find = () => findChannelChat({ req, identity });

  const existing = await find();

  if (existing && thread && !existing.channelThread) {
    await req.frogbot.update({
      collection: chat.chatsSlug,
      id: existing.id,
      data: { channelThread: thread },
      req,
      overrideAccess: true,
    });
  }

  if (existing) return existing.id;

  try {
    const created = await req.frogbot.create({
      collection: chat.chatsSlug,
      data: {
        user,
        agent: identity.agent,
        channel: identity.piece,
        externalId: identity.thread ?? identity.peer,
        channelKey,
        ...(thread ? { channelThread: thread } : {}),
      },
      req,
      overrideAccess: true,
    });

    return created.id;
  } catch (error) {
    const winner = await find();

    if (winner) return winner.id;

    throw error;
  }
}
