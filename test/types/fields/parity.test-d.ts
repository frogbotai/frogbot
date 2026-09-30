import type { FieldAccessArgs, FieldHookArgs, TextField, ValidateOptions } from 'frogbot';
import type {
  BaseValidateOptions,
  FieldAccessArgs as PayloadFieldAccessArgs,
  FieldHookArgs as PayloadFieldHookArgs,
  TextField as PayloadTextField,
} from 'payload';
import { expectTypeOf } from 'vitest';

expectTypeOf<keyof FieldHookArgs>().toEqualTypeOf<keyof PayloadFieldHookArgs>();
expectTypeOf<keyof ValidateOptions>().toEqualTypeOf<keyof BaseValidateOptions<any, any, any>>();
expectTypeOf<keyof FieldAccessArgs>().toEqualTypeOf<keyof PayloadFieldAccessArgs>();

expectTypeOf<Omit<FieldHookArgs, 'req' | 'field' | 'siblingFields'>>().toEqualTypeOf<
  Omit<PayloadFieldHookArgs, 'req' | 'field' | 'siblingFields'>
>();

expectTypeOf<Omit<ValidateOptions, 'req'>>().toEqualTypeOf<
  Omit<BaseValidateOptions<any, any, any>, 'req'>
>();

expectTypeOf<Omit<FieldAccessArgs, 'req'>>().toEqualTypeOf<Omit<PayloadFieldAccessArgs, 'req'>>();

expectTypeOf<keyof NonNullable<TextField['hooks']>>().toEqualTypeOf<
  keyof NonNullable<PayloadTextField['hooks']>
>();
