import { createClientField } from 'payload';
import { describe, expect, it } from 'vitest';

import { moneyField } from '../../../../../packages/frogbot/src/fields/baseFields/money/index.js';
import type { TextField } from '../../../../../packages/frogbot/src/fields/config/types.js';

type Schema = Parameters<NonNullable<TextField['typescriptSchema']>[number]>[0]['jsonSchema'];

function runSchema(
  field: { typescriptSchema?: TextField['typescriptSchema'] },
  jsonSchema: Schema,
) {
  return (field.typescriptSchema ?? []).reduce(
    (schema, entry) => entry({ jsonSchema: schema }),
    jsonSchema,
  );
}

const moneyText = 'Decimal amount in USD, in whole units, not minor units such as cents';

describe('moneyField', () => {
  it('returns a number field marked as USD money with automatic precision', () => {
    const field = moneyField({ name: 'price' });

    expect(field.type).toBe('number');
    expect(field.admin?.custom).toEqual({
      frogbot: { kind: { type: 'money', currency: 'USD', precision: 'auto' } },
    });
  });

  it('records the currency and precision in the marker', () => {
    const field = moneyField({ name: 'price', currency: 'EUR', precision: 4 });

    expect(field.admin?.custom?.frogbot).toEqual({
      kind: { type: 'money', currency: 'EUR', precision: 4 },
    });
  });

  it('uses FieldCell for the list cell and MoneyField for editing', () => {
    const field = moneyField({ name: 'price' });

    expect(field.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#MoneyField',
    });
  });

  it('does not keep currency or precision on the field', () => {
    const field = moneyField({ name: 'price', currency: 'EUR', precision: 2 });

    expect(field).not.toHaveProperty('currency');
    expect(field).not.toHaveProperty('precision');
  });

  it('passes number field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => 1;
    const validate = () => true as const;
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = moneyField({
      name: 'price',
      label: 'Price',
      min: 0,
      max: 100,
      required: true,
      defaultValue: 5,
      access,
      hooks: { afterRead: [afterRead] },
      validate,
      virtual: true,
      admin: { readOnly: true, custom: { other: true, frogbot: { extra: 1 } } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'price',
      label: 'Price',
      min: 0,
      max: 100,
      required: true,
      defaultValue: 5,
      access,
      hooks: { afterRead: [afterRead] },
      validate,
      virtual: true,
      admin: {
        readOnly: true,
        custom: {
          other: true,
          frogbot: { extra: 1, kind: { type: 'money', currency: 'USD', precision: 'auto' } },
        },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('moneyField option errors', () => {
  it.each([
    [
      { currency: 'usd' },
      'moneyField "price": currency "usd" must be a three-letter uppercase ISO 4217 code',
    ],
    [
      { currency: 'US' },
      'moneyField "price": currency "US" must be a three-letter uppercase ISO 4217 code',
    ],
    [
      { precision: -1 },
      'moneyField "price": precision must be \'auto\' or a whole number from 0 to 100, got -1',
    ],
    [
      { precision: 2.5 },
      'moneyField "price": precision must be \'auto\' or a whole number from 0 to 100, got 2.5',
    ],
    [
      { precision: 101 },
      'moneyField "price": precision must be \'auto\' or a whole number from 0 to 100, got 101',
    ],
    [{ hasMany: true }, 'moneyField "price": hasMany is not supported'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => moneyField({ name: 'price', ...(options as object) })).toThrow(new Error(message));
  });
});

describe('moneyField typescriptSchema', () => {
  it('describes the value to agents when there is no description', () => {
    const field = moneyField({ name: 'price' });

    expect(runSchema(field, { type: ['number', 'null'] }).description).toBe(moneyText);
  });

  it('appends the money text to the developer description', () => {
    const field = moneyField({ name: 'price', admin: { description: 'Retail price' } });

    expect(runSchema(field, { type: 'number', description: 'Retail price' }).description).toBe(
      'Retail price (decimal amount in USD, in whole units, not minor units such as cents)',
    );
  });

  it('names the field currency', () => {
    const field = moneyField({ name: 'price', currency: 'EUR' });

    expect(runSchema(field, { type: 'number' }).description).toBe(
      'Decimal amount in EUR, in whole units, not minor units such as cents',
    );
  });

  it('turns min into a schema minimum', () => {
    const field = moneyField({ name: 'monthlyBudget', min: 0 });

    expect(runSchema(field, { type: ['number', 'null'] })).toMatchObject({ minimum: 0 });
  });
});

describe('moneyField in the admin', () => {
  it('sends the marker but not the agent text to the browser', () => {
    const field = moneyField({ name: 'price', admin: { description: 'Retail price' } });

    const clientField = createClientField({
      defaultIDType: 'number',
      field: field as never,
      i18n: { t: (key: string) => key } as never,
      importMap: {},
    });

    expect(clientField).not.toHaveProperty('typescriptSchema');
    expect(clientField.admin).not.toHaveProperty('components');
    expect(clientField.admin?.custom).toEqual({
      frogbot: { kind: { type: 'money', currency: 'USD', precision: 'auto' } },
    });
    expect(clientField.admin?.description).toBe('Retail price');
  });
});
