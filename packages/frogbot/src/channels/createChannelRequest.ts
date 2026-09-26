import type { Author, Thread } from 'chat';

import type { FrogBot } from '../frogbot.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { FrogBotRequest } from '../types/request.js';
import type { ChannelBinding } from './types.js';

export type ChannelRequest = {
  client: unknown;
  req: FrogBotRequest;
};

export async function createChannelRequest({
  author,
  binding,
  frogbot,
  thread,
}: {
  author: Author;
  binding: ChannelBinding;
  frogbot: FrogBot;
  thread: Pick<Thread, 'id'>;
}): Promise<ChannelRequest> {
  const runtime = pieceInstanceRuntime(binding.instance);

  const req = await frogbot.createRequest({
    context: {
      channel: {
        piece: binding.instance.piece,
        threadId: thread.id,
        author: {
          id: author.userId,
          ...(author.userName ? { username: author.userName } : {}),
          ...(author.fullName ? { name: author.fullName } : {}),
        },
      },
    },
  });

  const client = await runtime.client({ req });
  const user = await runtime.definition.channel!.identity({ author, client: client as never, req });

  return { client, req: Object.assign(req, { user }) };
}
