import { describe, expect, it } from 'vitest';

import { durationField } from '../../../../../packages/frogbot/src/fields/baseFields/duration/index.js';
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

const durationText = 'Duration in whole seconds, for example 5400 for 1 hour 30 minutes';

describe('durationField', () => {
  it('returns a number field marked as an h:mm:ss duration', () => {
    const field = durationField({ name: 'timeSpent' });

    expect(field.type).toBe('number');
    expect(field.admin?.custom).toEqual({
      frogbot: { kind: { type: 'duration', format: 'h:mm:ss' } },
    });
  });

  it('records the format in the marker and not on the field', () => {
    const field = durationField({ name: 'timeSpent', format: 'h:mm' });

    expect(field.admin?.custom?.frogbot).toEqual({ kind: { type: 'duration', format: 'h:mm' } });
    expect(field).not.toHaveProperty('format');
  });

  it('uses FieldCell for the list cell and DurationField for editing', () => {
    const field = durationField({ name: 'timeSpent' });

    expect(field.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#DurationField',
    });
  });

  it('passes number field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => 1;
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = durationField({
      name: 'timeSpent',
      label: 'Time spent',
      min: 0,
      max: 86400,
      required: true,
      defaultValue: 60,
      access,
      hooks: { afterRead: [afterRead] },
      admin: { readOnly: true, placeholder: '0:00', custom: { other: true } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'timeSpent',
      label: 'Time spent',
      min: 0,
      max: 86400,
      required: true,
      defaultValue: 60,
      access,
      hooks: { afterRead: [afterRead] },
      admin: {
        readOnly: true,
        placeholder: '0:00',
        custom: { other: true, frogbot: { kind: { type: 'duration', format: 'h:mm:ss' } } },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('durationField option errors', () => {
  it.each([
    [{ hasMany: true }, 'durationField "timeSpent": hasMany is not supported'],
    [{ minRows: 1 }, 'durationField "timeSpent": minRows is not supported'],
    [{ maxRows: 2 }, 'durationField "timeSpent": maxRows is not supported'],
    [{ maxRows: 2, format: 'mm' }, 'durationField "timeSpent": maxRows is not supported'],
    [{ format: 'mm' }, 'durationField "timeSpent": format must be "h:mm" or "h:mm:ss", got "mm"'],
    [{ format: 3 }, 'durationField "timeSpent": format must be "h:mm" or "h:mm:ss", got 3'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => durationField({ name: 'timeSpent', ...(options as object) })).toThrow(
      new Error(message),
    );
  });
});

describe('durationField typescriptSchema', () => {
  it('tells agents the value is whole seconds', () => {
    const field = durationField({ name: 'timeSpent' });

    expect(runSchema(field, { type: ['number', 'null'] })).toEqual({
      type: ['integer', 'null'],
      description: durationText,
    });
  });

  it('appends the duration text to the developer description and keeps limits', () => {
    const field = durationField({
      name: 'timeSpent',
      min: 0,
      admin: { description: 'Logged time' },
    });

    expect(runSchema(field, { type: 'number', description: 'Logged time' })).toEqual({
      type: 'integer',
      description:
        'Logged time (duration in whole seconds, for example 5400 for 1 hour 30 minutes)',
      minimum: 0,
    });
  });
});

describe('durationField validate', () => {
  it.each([
    [1.5, 'Enter a duration in whole seconds.'],
    [-90, true],
    [5400, true],
    [0, true],
  ])('validates %o', async (value, expected) => {
    expect(await validateField(durationField({ name: 'timeSpent' }), value)).toBe(expected);
  });

  it('rejects negative values when min is 0', async () => {
    const field = durationField({ name: 'timeSpent', min: 0 });

    expect(await validateField(field, -90)).toBe('validation:lessThanMin');
  });
});
