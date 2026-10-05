import { describe, expect, it, vi } from 'vitest';

import { phoneField } from '../../../../../packages/frogbot/src/fields/baseFields/phone/index.js';
import type { TextField } from '../../../../../packages/frogbot/src/fields/config/types.js';
import { validateField } from './validateField.js';

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

const message = 'Enter a phone number with 7 to 15 digits.';

describe('phoneField', () => {
  it('returns a text field marked as a phone number', () => {
    const field = phoneField({ name: 'phone' });

    expect(field.type).toBe('text');
    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type: 'phone' } } });
  });

  it('uses FieldCell for the list cell and PhoneField for editing', () => {
    const field = phoneField({ name: 'phone' });

    expect(field.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#PhoneField',
    });
  });

  it('passes text field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => '5551234567';
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = phoneField({
      name: 'phone',
      label: 'Phone',
      minLength: 7,
      maxLength: 30,
      required: true,
      defaultValue: '5551234567',
      access,
      hooks: { afterRead: [afterRead] },
      admin: { readOnly: true, placeholder: '+1', custom: { other: true } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'phone',
      label: 'Phone',
      minLength: 7,
      maxLength: 30,
      required: true,
      defaultValue: '5551234567',
      access,
      hooks: { afterRead: [afterRead] },
      admin: {
        readOnly: true,
        placeholder: '+1',
        custom: { other: true, frogbot: { kind: { type: 'phone' } } },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('phoneField option errors', () => {
  it.each([
    [{ hasMany: true }, 'phoneField "phone": hasMany is not supported'],
    [{ minRows: 1 }, 'phoneField "phone": minRows is not supported'],
    [{ maxRows: 2 }, 'phoneField "phone": maxRows is not supported'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => phoneField({ name: 'phone', ...(options as object) })).toThrow(new Error(message));
  });
});

describe('phoneField typescriptSchema', () => {
  it('describes the value to agents when there is no description', () => {
    const field = phoneField({ name: 'phone' });

    expect(runSchema(field, { type: ['string', 'null'] })).toEqual({
      type: ['string', 'null'],
      description: 'Phone number as text, for example +44 20 7946 0958 or (415) 555-9876',
    });
  });

  it('appends the phone text to the developer description', () => {
    const field = phoneField({ name: 'phone', admin: { description: 'Office line' } });

    expect(runSchema(field, { type: 'string', description: 'Office line' }).description).toBe(
      'Office line (phone number as text, for example +44 20 7946 0958 or (415) 555-9876)',
    );
  });
});

describe('phoneField validate', () => {
  it.each([
    ['5551234567', true],
    ['+44 20 7946 0958', true],
    ['call me', message],
    ['123', message],
    [null, true],
    ['', true],
  ])('validates %j', async (value, expected) => {
    expect(await validateField(phoneField({ name: 'phone' }), value)).toBe(expected);
  });

  it('keeps the developer length limits', async () => {
    const field = phoneField({ name: 'phone', minLength: 10, maxLength: 12 });

    expect(await validateField(field, '5551234')).toBe('validation:longerThanMin');
    expect(await validateField(field, '(555) 123-4567')).toBe('validation:shorterThanMax');
    expect(await validateField(field, '555.123.4567')).toBe(true);
  });

  it('keeps required when the developer passes a validate', async () => {
    const validate = vi.fn(() => true as const);
    const field = phoneField({ name: 'phone', required: true, validate });

    expect(await validateField(field, null)).toBe('validation:required');
    expect(validate).not.toHaveBeenCalled();
  });

  it('runs the developer validate after the kind check', async () => {
    const field = phoneField({ name: 'phone', validate: () => 'UK numbers only.' });

    expect(await validateField(field, 'call me')).toBe(message);
    expect(await validateField(field, '5551234567')).toBe('UK numbers only.');
  });
});
