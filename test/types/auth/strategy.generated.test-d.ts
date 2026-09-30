import type {
  AuthConfig,
  AuthStrategy,
  AuthStrategyFunction,
  AuthStrategyFunctionArgs,
  AuthStrategyResult,
  FrogBotInstance,
  FrogBotRequest,
  TypedUser,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { User } from './.generated/frogbot-types.js';

expectTypeOf<AuthStrategyFunctionArgs['frogbot']>().toEqualTypeOf<FrogBotInstance>();
expectTypeOf<AuthStrategyFunctionArgs['req']>().toEqualTypeOf<FrogBotRequest | undefined>();
expectTypeOf<Extract<'payload', keyof AuthStrategyFunctionArgs>>().toEqualTypeOf<never>();
expectTypeOf<AuthStrategyResult['user']>().toEqualTypeOf<
  (TypedUser & { _strategy?: string; collection?: string }) | null
>();
expectTypeOf<AuthStrategy['authenticate']>().toEqualTypeOf<AuthStrategyFunction>();
expectTypeOf<NonNullable<AuthConfig['strategies']>>().toEqualTypeOf<AuthStrategy[]>();

export const headerToken: AuthStrategy = {
  name: 'header-token',
  authenticate: async ({ frogbot, headers, req }) => {
    expectTypeOf(frogbot).toEqualTypeOf<FrogBotInstance>();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest | undefined>();

    const { docs } = await frogbot.find({
      collection: 'users',
      where: { code: { equals: headers.get('code') } },
    });

    expectTypeOf(docs).toEqualTypeOf<User[]>();
    expectTypeOf(docs[0]?.email).toEqualTypeOf<string | null | undefined>();

    return {
      responseHeaders: new Headers({ 'x-strategy': 'header-token' }),
      user: docs[0] ? { ...docs[0], collection: 'users', email: null } : null,
    };
  },
};

export const synchronousStrategy: AuthStrategy = {
  name: 'anonymous',
  authenticate: () => ({ user: null }),
};

export async function authenticateWithoutRequest(frogbot: FrogBotInstance) {
  return headerToken.authenticate({ frogbot, headers: new Headers() });
}
