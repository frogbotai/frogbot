import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { FrogBotRequest } from '../types/request.js';
import type { ChatDocument } from './findChat.js';

export type ResolveChannelLabelProps = {
  req: FrogBotRequest;
  chat: Pick<ChatDocument, 'channel' | 'channelKey' | 'channelThread'>;
};

export function resolveChannelLabel({ req, chat }: ResolveChannelLabelProps): string | null {
  if (!chat.channelKey) return null;

  const instances = req.frogbot.config.pieces.instances;

  const instance =
    instances.find(({ slug }) => slug === chat.channelThread?.account) ??
    instances.find(({ piece }) => piece === chat.channel);

  if (instance) return pieceInstanceDefinition(instance).label;

  return chat.channel || null;
}
