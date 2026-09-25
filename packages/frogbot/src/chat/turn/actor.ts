import type { FrogBotRequest } from '../../types/request.js';
import type { TurnActor } from './types.js';

export function actorFromRequest(req: FrogBotRequest): TurnActor {
  const channel = req.context.channel;
  const user = req.user as (FrogBotRequest['user'] & { collection?: string }) | null;

  return {
    user: user ? { collection: user.collection ?? '', id: user.id } : null,
    ...(channel
      ? {
          channel: {
            piece: channel.piece,
            id: channel.author.id,
            ...(channel.author.username ? { username: channel.author.username } : {}),
            ...(channel.author.name ? { name: channel.author.name } : {}),
          },
        }
      : {}),
  };
}
