import { describe, expect, it, vi } from 'vitest';

import { barcodeField } from '../../../../../packages/frogbot/src/fields/baseFields/barcode/index.js';
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

describe('barcodeField', () => {
  it('returns a text field marked as a barcode', () => {
    const field = barcodeField({ name: 'sku' });

    expect(field.type).toBe('text');
    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type: 'barcode' } } });
  });

  it('uses FieldCell for the list cell and the text input for editing', () => {
    const field = barcodeField({ name: 'sku' });

    expect(field.admin?.components).toEqual({ Cell: '@frogbotai/next/client#FieldCell' });
  });

  it('passes text field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => '0123456789012';
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = barcodeField({
      name: 'sku',
      label: 'SKU',
      minLength: 8,
      maxLength: 13,
      required: true,
      defaultValue: '0123456789012',
      access,
      hooks: { afterRead: [afterRead] },
      admin: { readOnly: true, placeholder: 'EAN-13', custom: { other: true } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'sku',
      label: 'SKU',
      minLength: 8,
      maxLength: 13,
      required: true,
      defaultValue: '0123456789012',
      access,
      hooks: { afterRead: [afterRead] },
      admin: {
        readOnly: true,
        placeholder: 'EAN-13',
        custom: { other: true, frogbot: { kind: { type: 'barcode' } } },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('barcodeField option errors', () => {
  it.each([
    [{ hasMany: true }, 'barcodeField "sku": hasMany is not supported'],
    [{ minRows: 1 }, 'barcodeField "sku": minRows is not supported'],
    [{ maxRows: 2 }, 'barcodeField "sku": maxRows is not supported'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => barcodeField({ name: 'sku', ...(options as object) })).toThrow(new Error(message));
  });
});

describe('barcodeField typescriptSchema', () => {
  it('describes the value to agents when there is no description', () => {
    const field = barcodeField({ name: 'sku' });

    expect(runSchema(field, { type: ['string', 'null'] })).toEqual({
      type: ['string', 'null'],
      description: 'Barcode value as text, for example a UPC or EAN code',
    });
  });

  it('appends the barcode text to the developer description', () => {
    const field = barcodeField({ name: 'sku', admin: { description: 'Shelf code' } });

    expect(runSchema(field, { type: 'string', description: 'Shelf code' }).description).toBe(
      'Shelf code (barcode value as text, for example a UPC or EAN code)',
    );
  });
});

describe('barcodeField validate', () => {
  it.each(['0123456789012', 'ABC-123 / lot 7', ' padded ', 'javascript:alert(1)', null, ''])(
    'accepts %j',
    async (value) => {
      expect(await validateField(barcodeField({ name: 'sku' }), value)).toBe(true);
    },
  );

  it('keeps the developer length limits', async () => {
    const field = barcodeField({ name: 'sku', minLength: 8, maxLength: 13 });

    expect(await validateField(field, '1234567')).toBe('validation:longerThanMin');
    expect(await validateField(field, '01234567890123')).toBe('validation:shorterThanMax');
    expect(await validateField(field, '01234567')).toBe(true);
  });

  it('keeps required when the developer passes a validate', async () => {
    const validate = vi.fn(() => true as const);
    const field = barcodeField({ name: 'sku', required: true, validate });

    expect(await validateField(field, null)).toBe('validation:required');
    expect(validate).not.toHaveBeenCalled();
  });

  it('runs the developer validate for a value', async () => {
    const field = barcodeField({ name: 'sku', validate: () => 'Unknown code.' });

    expect(await validateField(field, '0123456789012')).toBe('Unknown code.');
  });
});
