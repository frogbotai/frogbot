import { describe, expect, it, vi } from 'vitest';

import { getHexColor } from '../../../../../packages/frogbot/src/fields/baseFields/color/getHexColor.js';
import { colorField } from '../../../../../packages/frogbot/src/fields/baseFields/color/index.js';
import type { TextField } from '../../../../../packages/frogbot/src/fields/config/types.js';
import { validateField } from './validateField.js';

type Schema = Parameters<NonNullable<TextField['jsonSchema']>[number]>[0]['jsonSchema'];

function runSchema(field: { jsonSchema?: TextField['jsonSchema'] }, jsonSchema: Schema) {
  return (field.jsonSchema ?? []).reduce(
    (schema, entry) => entry({ jsonSchema: schema, variant: 'output' }),
    jsonSchema,
  );
}

const message = 'Enter a hex color such as #3b82f6.';

const defaultSwatches = [
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
];

describe('colorField', () => {
  it('returns a text field marked as a color with the default swatches', () => {
    const field = colorField({ name: 'color' });

    expect(field.type).toBe('text');
    expect(field.admin?.custom).toEqual({
      frogbot: { kind: { type: 'color', swatches: defaultSwatches } },
    });
  });

  it('uses FieldCell for the list cell and ColorField for editing', () => {
    expect(colorField({ name: 'color' }).admin?.components).toEqual({
      Cell: '@frogbotai/ui/admin#FieldCell',
      Field: '@frogbotai/ui/admin#ColorField',
    });
  });

  it('keeps the swatches given, as lowercase six-digit hex', () => {
    const field = colorField({ name: 'color', swatches: ['#F00', '#00ff00'] });

    expect(field.admin?.custom?.frogbot).toEqual({
      kind: { type: 'color', swatches: ['#ff0000', '#00ff00'] },
    });
  });

  it('offers no swatches for an empty list', () => {
    expect(colorField({ name: 'color', swatches: [] }).admin?.custom?.frogbot).toEqual({
      kind: { type: 'color', swatches: [] },
    });
  });

  it('leaves swatches out of the text field', () => {
    expect(colorField({ name: 'color', swatches: ['#fff'] })).not.toHaveProperty('swatches');
  });

  it('passes text field options through unchanged', () => {
    const access = { update: () => false };
    const developerEntry: NonNullable<TextField['jsonSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = colorField({
      name: 'color',
      label: 'Color',
      required: true,
      defaultValue: '#3b82f6',
      access,
      admin: { readOnly: true, placeholder: '#000', custom: { other: true } },
      jsonSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'color',
      label: 'Color',
      required: true,
      defaultValue: '#3b82f6',
      access,
      admin: {
        readOnly: true,
        placeholder: '#000',
        custom: { other: true, frogbot: { kind: { type: 'color' } } },
      },
    });
    expect(field.jsonSchema).toHaveLength(2);
    expect(field.jsonSchema?.[1]).toBe(developerEntry);
  });
});

describe('colorField option errors', () => {
  it.each([
    [{ hasMany: true }, 'colorField "color": hasMany is not supported'],
    [{ minRows: 1 }, 'colorField "color": minRows is not supported'],
    [{ maxRows: 2 }, 'colorField "color": maxRows is not supported'],
    [{ minLength: 4 }, 'colorField "color": minLength is not supported'],
    [{ maxLength: 7 }, 'colorField "color": maxLength is not supported'],
    [
      { swatches: ['#3b82f6', 'blue'] },
      'colorField "color": swatch "blue" is not a #rgb or #rrggbb color',
    ],
  ])('rejects %o at call time', (options, error) => {
    expect(() => colorField({ name: 'color', ...(options as object) })).toThrow(new Error(error));
  });
});

describe('colorField jsonSchema', () => {
  it('describes the value to agents when there is no description', () => {
    expect(runSchema(colorField({ name: 'color' }), { type: ['string', 'null'] })).toEqual({
      type: ['string', 'null'],
      description: 'Hex color as #rrggbb or #rgb, for example #3b82f6',
    });
  });

  it('appends the color text to the developer description', () => {
    const field = colorField({ name: 'color', admin: { description: 'Tag color' } });

    expect(runSchema(field, { type: 'string', description: 'Tag color' }).description).toBe(
      'Tag color (hex color as #rrggbb or #rgb, for example #3b82f6)',
    );
  });
});

describe('colorField validate', () => {
  it.each([
    ['#3b82f6', true],
    ['#3B82F6', true],
    ['#fff', true],
    ['#FfF', true],
    ['3b82f6', message],
    ['#3b82f', message],
    ['#3b82f6ff', message],
    ['#ggg', message],
    [' #fff', message],
    ['#fff ', message],
    ['blue', message],
    ['rgb(0, 0, 0)', message],
    [null, true],
    ['', true],
  ])('validates %j', async (value, expected) => {
    expect(await validateField(colorField({ name: 'color' }), value)).toBe(expected);
  });

  it('keeps required when the developer passes a validate', async () => {
    const validate = vi.fn(() => true as const);
    const field = colorField({ name: 'color', required: true, validate });

    expect(await validateField(field, null)).toBe('validation:required');
    expect(validate).not.toHaveBeenCalled();
  });

  it('runs the developer validate after the kind check', async () => {
    const field = colorField({ name: 'color', validate: () => 'Brand colors only.' });

    expect(await validateField(field, 'blue')).toBe(message);
    expect(await validateField(field, '#3b82f6')).toBe('Brand colors only.');
  });
});

describe('getHexColor', () => {
  it.each([
    ['#3b82f6', '#3b82f6'],
    ['#3B82F6', '#3b82f6'],
    ['#f0a', '#ff00aa'],
    ['#F0A', '#ff00aa'],
  ])('reads %j as %j', (value, expected) => {
    expect(getHexColor({ value })).toBe(expected);
  });

  it.each([null, undefined, '', 'red', '#12', '#12345', '#1234567', 42, {}, '#fff\n'])(
    'returns undefined for %j',
    (value) => {
      expect(getHexColor({ value })).toBeUndefined();
    },
  );
});
