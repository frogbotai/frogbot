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

expectTypeOf<AuthStrategyFunctionArgs['frogbot']>().toEqualTypeOf<FrogBotInstance>();
expectTypeOf<AuthStrategyFunctionArgs['req']>().toEqualTypeOf<FrogBotRequest | undefined>();
expectTypeOf<Extract<'payload', keyof AuthStrategyFunctionArgs>>().toEqualTypeOf<never>();
expectTypeOf<AuthStrategyResult['user']>().toEqualTypeOf<
  (TypedUser & { _strategy?: string; collection?: string }) | null
>();
expectTypeOf<FrogBotRequest['user']>().toMatchTypeOf<AuthStrategyResult['user']>();
expectTypeOf<AuthStrategy['authenticate']>().toEqualTypeOf<AuthStrategyFunction>();
expectTypeOf<NonNullable<AuthConfig['strategies']>>().toEqualTypeOf<AuthStrategy[]>();

export function resultFromRequest(req: FrogBotRequest): AuthStrategyResult {
  return { user: req.user };
}

export const strategy: AuthStrategy = {
  name: 'fallback',
  authenticate: () => ({ user: { id: 1, email: null, collection: 'users' } }),
};

export function authenticateWithoutRequest(frogbot: FrogBotInstance) {
  return strategy.authenticate({ frogbot, headers: new Headers() });
}
