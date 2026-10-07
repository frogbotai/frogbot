import type { ChannelContext } from '../channels/types.js';
import type { FrogBot } from '../frogbot.js';
import type { TypedUser } from './generated.js';
import type { PayloadRequest } from './payload.js';

declare module 'payload' {
  interface RequestContext {
    channel?: ChannelContext;
  }
}

export interface FrogBotRequest extends Omit<PayloadRequest, 'payload' | 'user'> {
  user: TypedUser | null;
  frogbot: FrogBot;
}

export type FrogBotArgs<TArgs> = Omit<TArgs, 'req'> & { req: FrogBotRequest };
