import { expectTypeOf } from 'vitest';

import { env } from './builders.js';
import type { DefinedEnv } from './defineEnv.js';

type DefaultBoolean = ReturnType<typeof env.boolean>['default'] extends (
  value: boolean,
) => infer TBuilder
  ? TBuilder
  : never;
type RequiredNumber = ReturnType<typeof env.number>['required'] extends () => infer TBuilder
  ? TBuilder
  : never;
type Service = DefinedEnv<{
  enabled: DefaultBoolean;
  level: ReturnType<typeof env.enum<readonly ['info', 'error']>>;
  port: RequiredNumber;
  secret: ReturnType<typeof env.string>;
}>;

expectTypeOf<Service['enabled']>().toEqualTypeOf<boolean>();
expectTypeOf<Service['level']>().toEqualTypeOf<'info' | 'error' | undefined>();
expectTypeOf<Service['port']>().toEqualTypeOf<number>();
expectTypeOf<Service['secret']>().toEqualTypeOf<string | undefined>();
