// FrogBot's request shape. Extends Payload's `PayloadRequest` but swaps
// the `payload` field for `frogbot: FrogBot`. User code authored against
// `FrogBotRequest` cannot reference `req.payload` (type error), keeping
// the FrogBot brand consistent in every hook, access function, and
// custom endpoint.

import type { ChannelContext } from '../channels/types.js';
import type { FrogBot } from '../frogbot.js';
import type { TypeWithID } from './generated.js';
import type { PayloadRequest } from './payload.js';

declare module 'payload' {
  interface RequestContext {
    channel?: ChannelContext;
  }
}

export interface FrogBotRequest<TUser = Record<string, unknown> & TypeWithID> extends Omit<
  PayloadRequest,
  'payload' | 'user'
> {
  user: TUser | null;
  frogbot: FrogBot;
}
