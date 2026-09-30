import { createGoogle } from '@frogbotai/piece-google';
import { expectTypeOf } from 'vitest';

const google = createGoogle({ auth: { accessToken: 'token' } });

expectTypeOf<Extract<keyof typeof google, string>>().toEqualTypeOf<
  'slug' | 'piece' | 'oauth' | 'client' | 'triggers' | '~capabilities'
>();
expectTypeOf(google.triggers).toEqualTypeOf<Record<string, never>>();
