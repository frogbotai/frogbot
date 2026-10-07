import type {
  Field,
  FieldHook,
  FieldHookArgs,
  FrogBot,
  FrogBotRequest,
  TabAsField,
  TextField,
  UIField,
} from 'frogbot';
import type { FieldHookArgs as PayloadFieldHookArgs } from 'payload';
import { expectTypeOf } from 'vitest';

type Hooks = NonNullable<TextField['hooks']>;

type HookArgs<TPhase extends keyof Hooks> = Parameters<NonNullable<Hooks[TPhase]>[number]>[0];

type RuntimeKeys = 'path' | 'schemaPath' | 'indexPath' | 'blockData' | 'global';

type FieldAffectingData =
  Exclude<Extract<Field, { name: string }>, UIField> | (TabAsField & { name: string });

expectTypeOf<{ [TPhase in keyof Hooks]: Pick<HookArgs<TPhase>, RuntimeKeys> }>().toEqualTypeOf<{
  [TPhase in keyof Hooks]: Pick<PayloadFieldHookArgs, RuntimeKeys>;
}>();

expectTypeOf<{ [TPhase in keyof Hooks]: HookArgs<TPhase>['field'] }>().toEqualTypeOf<{
  [TPhase in keyof Hooks]: FieldAffectingData;
}>();

expectTypeOf<{ [TPhase in keyof Hooks]: HookArgs<TPhase>['req'] }>().toEqualTypeOf<{
  [TPhase in keyof Hooks]: FrogBotRequest;
}>();

declare const args: FieldHookArgs;

expectTypeOf(args.path).toEqualTypeOf<PayloadFieldHookArgs['path']>();
expectTypeOf(args.schemaPath).toEqualTypeOf<PayloadFieldHookArgs['schemaPath']>();
expectTypeOf(args.indexPath).toEqualTypeOf<PayloadFieldHookArgs['indexPath']>();
expectTypeOf(args.blockData).toEqualTypeOf<PayloadFieldHookArgs['blockData']>();
expectTypeOf(args.global).toEqualTypeOf<PayloadFieldHookArgs['global']>();
expectTypeOf(args.field).toEqualTypeOf<FieldAffectingData>();
expectTypeOf(args.field.name).toEqualTypeOf<string>();
expectTypeOf(args.req.frogbot).toEqualTypeOf<FrogBot>();
expectTypeOf(args.req).not.toHaveProperty('payload');

const text: TextField = {
  name: 'title',
  type: 'text',
  hooks: {
    afterChange: [
      ({ value, req }) => {
        expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();
        expectTypeOf(req).not.toHaveProperty('payload');

        return value;
      },
    ],
    afterRead: [
      ({ value, req }) => {
        expectTypeOf(req).not.toHaveProperty('payload');

        return value;
      },
    ],
    beforeChange: [
      ({ value, schemaPath, req }) => {
        expectTypeOf(req).not.toHaveProperty('payload');

        return schemaPath.length ? value : value;
      },
    ],
    beforeDuplicate: [
      ({ value, req }) => {
        expectTypeOf(req).not.toHaveProperty('payload');

        return value;
      },
    ],
    beforeValidate: [
      ({ value, req }) => {
        expectTypeOf(req).not.toHaveProperty('payload');

        return value;
      },
    ],
  },
};

type Post = { id: string; title: string };

type Siblings = { title: string };

const genericHook: FieldHook<Post, string, Siblings> = (hookArgs) => {
  expectTypeOf(hookArgs.data).toEqualTypeOf<Partial<Post> | undefined>();
  expectTypeOf(hookArgs.siblingData).toEqualTypeOf<Partial<Siblings>>();
  expectTypeOf(hookArgs.value).toEqualTypeOf<string | undefined>();

  return hookArgs.value ?? '';
};

expectTypeOf(text).toMatchTypeOf<Field>();
expectTypeOf(genericHook).toMatchTypeOf<NonNullable<Hooks['beforeChange']>[number]>();
