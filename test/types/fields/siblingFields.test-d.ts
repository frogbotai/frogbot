import {
  type Field,
  type FieldHookArgs,
  type RichTextField,
  type TabAsField,
  type TextField,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const args: FieldHookArgs;

expectTypeOf(args.siblingFields).toEqualTypeOf<(Field | TabAsField)[] | undefined>();

const richText = args.siblingFields?.find(
  (field): field is RichTextField => field.type === 'richText',
);

if (richText) {
  expectTypeOf(richText).toMatchTypeOf<RichTextField>();
}

args.siblingFields?.forEach((field) => {
  if (field.type === 'tab') {
    expectTypeOf(field.fields).toEqualTypeOf<Field[]>();
  }
});

type Hooks = NonNullable<TextField['hooks']>;
type HookArgs<TPhase extends keyof Hooks> = Parameters<NonNullable<Hooks[TPhase]>[number]>[0];

expectTypeOf<HookArgs<'afterChange'>['siblingFields']>().toEqualTypeOf<
  (Field | TabAsField)[] | undefined
>();

expectTypeOf<HookArgs<'afterRead'>['siblingFields']>().toEqualTypeOf<(Field | TabAsField)[]>();
expectTypeOf<HookArgs<'beforeChange'>['siblingFields']>().toEqualTypeOf<(Field | TabAsField)[]>();
expectTypeOf<HookArgs<'beforeDuplicate'>['siblingFields']>().toEqualTypeOf<
  (Field | TabAsField)[]
>();
expectTypeOf<HookArgs<'beforeValidate'>['siblingFields']>().toEqualTypeOf<(Field | TabAsField)[]>();
