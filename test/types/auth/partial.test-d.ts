import type { AuthResult, FrogBotRequest, TypedUser, TypeWithID } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare module 'frogbot' {
  interface GeneratedTypes {
    collections: {
      articles: { id: number; title: string };
    };
  }
}

type FallbackUser = Record<string, unknown> & TypeWithID;

expectTypeOf<TypedUser>().toEqualTypeOf<FallbackUser>();
expectTypeOf<FrogBotRequest['user']>().toEqualTypeOf<FallbackUser | null>();
expectTypeOf<AuthResult['user']>().toEqualTypeOf<FallbackUser | null>();
