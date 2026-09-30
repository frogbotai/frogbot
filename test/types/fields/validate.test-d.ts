import type { FrogBot, NumberField, TextField, ValidateOptions, VectorField } from 'frogbot';
import type { BaseValidateOptions, Operation } from 'payload';
import { expectTypeOf } from 'vitest';

declare const options: ValidateOptions;

expectTypeOf(options.blockData).toEqualTypeOf<BaseValidateOptions<any, any, any>['blockData']>();
expectTypeOf(options.preferences).toEqualTypeOf<
  BaseValidateOptions<any, any, any>['preferences']
>();
expectTypeOf(options.collectionSlug).toEqualTypeOf<string | undefined>();
expectTypeOf(options.overrideAccess).toEqualTypeOf<boolean | undefined>();
expectTypeOf(options.operation).toEqualTypeOf<Operation | undefined>();
expectTypeOf(options.req.frogbot).toEqualTypeOf<FrogBot>();
expectTypeOf(options.req).not.toHaveProperty('payload');

const text: TextField = {
  minLength: 3,
  name: 'title',
  type: 'text',
  validate: (value, fieldOptions) => {
    expectTypeOf(value).toBeAny();
    expectTypeOf(fieldOptions.minLength).toEqualTypeOf<number | undefined>();
    expectTypeOf(fieldOptions.type).toEqualTypeOf<'text'>();
    expectTypeOf(fieldOptions.operation).toEqualTypeOf<Operation | undefined>();
    expectTypeOf(fieldOptions.req.frogbot).toEqualTypeOf<FrogBot>();
    expectTypeOf(fieldOptions.req).not.toHaveProperty('payload');
    expectTypeOf(fieldOptions).not.toHaveProperty('hooks');
    expectTypeOf(fieldOptions).not.toHaveProperty('access');
    expectTypeOf(fieldOptions).not.toHaveProperty('validate');

    return value.length >= (fieldOptions.minLength ?? 0) || 'Too short';
  },
};

const textMany: TextField = {
  hasMany: true,
  name: 'tags',
  type: 'text',
  validate: (value, fieldOptions) => {
    expectTypeOf(value).toBeAny();
    expectTypeOf(fieldOptions.hasMany).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(fieldOptions.minLength).toEqualTypeOf<number | undefined>();

    return true;
  },
};

const number: NumberField = {
  max: 10,
  name: 'count',
  type: 'number',
  validate: (_value, fieldOptions) => {
    expectTypeOf(fieldOptions.max).toEqualTypeOf<number | undefined>();

    return true;
  },
};

const vector: VectorField = {
  dimensions: 3,
  name: 'embedding',
  type: 'vector',
  validate: (value) => {
    expectTypeOf(value).toEqualTypeOf<number[] | null | undefined>();

    return true;
  },
};

expectTypeOf(text).toMatchTypeOf<TextField>();
expectTypeOf(textMany).toMatchTypeOf<TextField>();
expectTypeOf(number).toMatchTypeOf<NumberField>();
expectTypeOf(vector).toMatchTypeOf<VectorField>();
