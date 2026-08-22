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

const level = env.enum(['info', 'error']);
expectTypeOf<EnvBuilderOutput<typeof level>>().toEqualTypeOf<'info' | 'error' | undefined>();

const custom = env.custom((raw) => ({ raw }));
expectTypeOf<EnvBuilderOutput<typeof custom>>().toEqualTypeOf<{ raw: string } | undefined>();
