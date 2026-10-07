import type { FieldAccessArgs, FieldHookArgs, TextField, ValidateOptions } from 'frogbot';
import type {
  BaseValidateOptions,
  FieldAccessArgs as PayloadFieldAccessArgs,
  FieldHookArgs as PayloadFieldHookArgs,
  TextField as PayloadTextField,
} from 'payload';
import { expectTypeOf } from 'vitest';

type Data = { title: string };

type SiblingData = { slug: string };

type Value = number;

expectTypeOf<keyof FieldHookArgs>().toEqualTypeOf<keyof PayloadFieldHookArgs>();

expectTypeOf<keyof ValidateOptions>().toEqualTypeOf<
  keyof BaseValidateOptions<Data, SiblingData, Value>
>();

expectTypeOf<keyof FieldAccessArgs>().toEqualTypeOf<keyof PayloadFieldAccessArgs>();

expectTypeOf<Omit<FieldHookArgs, 'req' | 'field' | 'siblingFields'>>().toEqualTypeOf<
  Omit<PayloadFieldHookArgs, 'req' | 'field' | 'siblingFields'>
>();

expectTypeOf<Omit<ValidateOptions<Data, SiblingData, object, Value>, 'req'>>().toEqualTypeOf<
  Omit<BaseValidateOptions<Data, SiblingData, Value>, 'req'>
>();

expectTypeOf<Omit<FieldAccessArgs, 'req'>>().toEqualTypeOf<Omit<PayloadFieldAccessArgs, 'req'>>();

expectTypeOf<keyof NonNullable<TextField['hooks']>>().toEqualTypeOf<
  keyof NonNullable<PayloadTextField['hooks']>
>();
