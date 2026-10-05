import { describe, expect, it, vi } from 'vitest';

import { percentField } from '../../../../../packages/frogbot/src/fields/baseFields/percent/index.js';
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

describe('percentField', () => {
  it('returns a number field marked as a percent with no decimals', () => {
    const field = percentField({ name: 'progress' });

    expect(field.type).toBe('number');
    expect(field.admin?.custom).toEqual({
      frogbot: { kind: { type: 'percent', precision: 0 } },
    });
  });

  it('records the precision in the marker and not on the field', () => {
    const field = percentField({ name: 'progress', precision: 2 });

    expect(field.admin?.custom?.frogbot).toEqual({ kind: { type: 'percent', precision: 2 } });
    expect(field).not.toHaveProperty('precision');
  });

  it('uses FieldCell for the list cell and PercentField for editing', () => {
    const field = percentField({ name: 'progress' });

    expect(field.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#PercentField',
    });
  });

  it('passes number field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => 1;
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = percentField({
      name: 'progress',
      label: 'Progress',
      min: 0,
      max: 1,
      required: true,
      defaultValue: 0.5,
      access,
      hooks: { afterRead: [afterRead] },
      admin: { readOnly: true, step: 0.1, custom: { other: true } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'progress',
      label: 'Progress',
      min: 0,
      max: 1,
      required: true,
      defaultValue: 0.5,
      access,
      hooks: { afterRead: [afterRead] },
      admin: {
        readOnly: true,
        step: 0.1,
        custom: { other: true, frogbot: { kind: { type: 'percent', precision: 0 } } },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('percentField option errors', () => {
  it.each([
    [{ hasMany: true }, 'percentField "progress": hasMany is not supported'],
    [{ minRows: 1 }, 'percentField "progress": minRows is not supported'],
    [{ maxRows: 2 }, 'percentField "progress": maxRows is not supported'],
    [{ minRows: 1, precision: 9 }, 'percentField "progress": minRows is not supported'],
    [
      { precision: 9 },
      'percentField "progress": precision must be a whole number from 0 to 8, got 9',
    ],
    [
      { precision: -1 },
      'percentField "progress": precision must be a whole number from 0 to 8, got -1',
    ],
    [
      { precision: 1.5 },
      'percentField "progress": precision must be a whole number from 0 to 8, got 1.5',
    ],
    [
      { precision: '2' },
      'percentField "progress": precision must be a whole number from 0 to 8, got "2"',
    ],
  ])('rejects %o at call time', (options, message) => {
    expect(() => percentField({ name: 'progress', ...(options as object) })).toThrow(
      new Error(message),
    );
  });
});

describe('percentField typescriptSchema', () => {
  it('describes the value to agents when there is no description', () => {
    const field = percentField({ name: 'progress' });

    expect(runSchema(field, { type: ['number', 'null'] })).toEqual({
      type: ['number', 'null'],
      description: 'Fraction where 1 means 100%, for example 0.42 for 42%',
    });
  });

  it('appends the percent text to the developer description', () => {
    const field = percentField({ name: 'progress', admin: { description: 'Work done' } });

    expect(runSchema(field, { type: 'number', description: 'Work done' }).description).toBe(
      'Work done (fraction where 1 means 100%, for example 0.42 for 42%)',
    );
  });
});

describe('percentField validate', () => {
  it('keeps required when the developer passes a validate', async () => {
    const validate = vi.fn(() => true as const);
    const field = percentField({ name: 'progress', required: true, validate });

    expect(await validateField(field, null)).toBe('validation:required');
    expect(validate).not.toHaveBeenCalled();
  });

  it('accepts negative and fractional values', async () => {
    const field = percentField({ name: 'progress' });

    expect(await validateField(field, -0.125)).toBe(true);
  });

  it('runs the developer validate for a value', async () => {
    const field = percentField({ name: 'progress', validate: () => 'Too much.' });

    expect(await validateField(field, 2)).toBe('Too much.');
  });
});
