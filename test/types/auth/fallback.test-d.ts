import type { AuthResult, FrogBotRequest, TypedUser, TypeWithID } from 'frogbot';
import { expectTypeOf } from 'vitest';

type FallbackUser = Record<string, unknown> & TypeWithID;

expectTypeOf<TypedUser>().toEqualTypeOf<FallbackUser>();
expectTypeOf<NonNullable<FrogBotRequest['user']>>().toEqualTypeOf<FallbackUser>();
expectTypeOf<AuthResult['user']>().toEqualTypeOf<FallbackUser | null>();
