import type { DocID } from '../collections/config/types.js';
import type { FrogbotRequest } from '../types/request.js';

export type ChannelChatAccess = Readonly<{ channelKey: string }>;

type ChannelChatAccessScope = {
  req: FrogbotRequest;
  agentSlug: string;
  chatId: DocID;
  channelKey: string;
};

const grants = new WeakMap<
  ChannelChatAccess,
  ChannelChatAccessScope & { frogbot: FrogbotRequest['frogbot']; userId: DocID | null }
>();

export function createChannelChatAccess(scope: ChannelChatAccessScope): ChannelChatAccess {
  const access = Object.freeze({ channelKey: scope.channelKey });

  grants.set(access, {
    ...scope,
    frogbot: scope.req.frogbot,
    userId: scope.req.user?.id ?? null,
  });

  return access;
}

export function hasChannelChatAccess({
  access,
  req,
  agentSlug,
  chat,
}: {
  access: ChannelChatAccess;
  req: FrogbotRequest;
  agentSlug: string;
  chat: { id: DocID; agent?: string | null; channelKey?: string | null };
}): boolean {
  const scope = grants.get(access);

  return !!(
    scope &&
    scope.req === req &&
    scope.frogbot === req.frogbot &&
    scope.userId === (req.user?.id ?? null) &&
    scope.agentSlug === agentSlug &&
    scope.agentSlug === chat.agent &&
    String(scope.chatId) === String(chat.id) &&
    scope.channelKey &&
    scope.channelKey === chat.channelKey
  );
}
