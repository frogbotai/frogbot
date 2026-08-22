import { expectTypeOf } from 'vitest';

import { env, type EnvBuilderOutput } from './builders.js';

expectTypeOf<EnvBuilderOutput<ReturnType<typeof env.string>>>().toEqualTypeOf<string | undefined>();
expectTypeOf<
  EnvBuilderOutput<ReturnType<typeof env.number>['required'] extends () => infer T ? T : never>
>().toEqualTypeOf<number>();
expectTypeOf<
  EnvBuilderOutput<
    ReturnType<typeof env.boolean>['default'] extends (value: boolean) => infer T ? T : never
  >
>().toEqualTypeOf<boolean>();

expectTypeOf<
  EnvBuilderOutput<ReturnType<typeof env.enum<readonly ['info', 'error']>>>
>().toEqualTypeOf<'info' | 'error' | undefined>();
expectTypeOf<EnvBuilderOutput<ReturnType<typeof env.custom<{ raw: string }>>>>().toEqualTypeOf<
  { raw: string } | undefined
>();
