import type { ChannelContext } from '../channels/types.js';
import type { FrogBot } from '../frogbot.js';
import type { TypedUser } from './generated.js';
import type { PayloadRequest } from './payload.js';

declare module 'payload' {
  interface RequestContext {
    channel?: ChannelContext;
    /** Set by `finishSignIn` before it issues the session: the sign-in method's slug, or `'password'`. */
    signIn?: { method: string };
  }
}

export interface FrogBotRequest extends Omit<PayloadRequest, 'payload' | 'user'> {
  user: TypedUser | null;
  frogbot: FrogBot;
}

export type FrogBotArgs<TArgs> = Omit<TArgs, 'req'> & { req: FrogBotRequest };

/**
 * The request a migration gets. It carries the migration's transaction. Migrations run before the app
 * exists, so it has no `frogbot`: change data through the adapter's `db` (or `session` on MongoDB).
 */
export type MigrationRequest = Omit<FrogBotRequest, 'frogbot'>;

/**
 * A database adapter's migration arguments as a migration file sees them: its own `req`, no `payload`.
 * A migration that still reads `payload` fails typecheck with "Property 'payload' does not exist": replace
 * `payload.*` calls with SQL through `db`, or with `migrationDatabase(req)` on MongoDB.
 */
export type MigrationArgs<TArgs> = Omit<TArgs, 'payload' | 'req'> & { req: MigrationRequest };
