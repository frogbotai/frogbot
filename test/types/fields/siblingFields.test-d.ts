import { type Field, type FieldHookArgs, type RichTextField, type TabAsField } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const args: FieldHookArgs;

expectTypeOf(args.siblingFields).toEqualTypeOf<(Field | TabAsField)[]>();

const richText = args.siblingFields.find(
  (field): field is RichTextField => field.type === 'richText',
);

if (richText) {
  expectTypeOf(richText).toMatchTypeOf<RichTextField>();
}

args.siblingFields.forEach((field) => {
  if (field.type === 'tab') {
    expectTypeOf(field.fields).toEqualTypeOf<Field[]>();
  }
});
