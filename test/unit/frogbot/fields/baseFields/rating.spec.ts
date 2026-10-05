import { describe, expect, it } from 'vitest';

import { ratingField } from '../../../../../packages/frogbot/src/fields/baseFields/rating/index.js';
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

describe('ratingField', () => {
  it('returns a number field from 1 to 5 marked as a rating', () => {
    const field = ratingField({ name: 'score' });

    expect(field).toMatchObject({ type: 'number', min: 1, max: 5 });
    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type: 'rating', max: 5 } } });
  });

  it('records max on the field and in the marker', () => {
    const field = ratingField({ name: 'score', max: 10 });

    expect(field).toMatchObject({ min: 1, max: 10 });
    expect(field.admin?.custom?.frogbot).toEqual({ kind: { type: 'rating', max: 10 } });
  });

  it('uses FieldCell for the list cell and RatingField for editing', () => {
    const field = ratingField({ name: 'score' });

    expect(field.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#RatingField',
    });
  });

  it('passes number field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => 1;
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = ratingField({
      name: 'score',
      label: 'Score',
      required: true,
      defaultValue: 3,
      access,
      hooks: { afterRead: [afterRead] },
      admin: { readOnly: true, custom: { other: true } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'score',
      label: 'Score',
      required: true,
      defaultValue: 3,
      access,
      hooks: { afterRead: [afterRead] },
      admin: {
        readOnly: true,
        custom: { other: true, frogbot: { kind: { type: 'rating', max: 5 } } },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('ratingField option errors', () => {
  it.each([
    [{ hasMany: true }, 'ratingField "score": hasMany is not supported'],
    [{ minRows: 1 }, 'ratingField "score": minRows is not supported'],
    [{ maxRows: 2 }, 'ratingField "score": maxRows is not supported'],
    [{ min: 0 }, 'ratingField "score": min is not supported'],
    [{ min: 0, max: 11 }, 'ratingField "score": min is not supported'],
    [{ max: 11 }, 'ratingField "score": max must be a whole number from 1 to 10, got 11'],
    [{ max: 0 }, 'ratingField "score": max must be a whole number from 1 to 10, got 0'],
    [{ max: 4.5 }, 'ratingField "score": max must be a whole number from 1 to 10, got 4.5'],
    [{ max: '5' }, 'ratingField "score": max must be a whole number from 1 to 10, got "5"'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => ratingField({ name: 'score', ...(options as object) })).toThrow(
      new Error(message),
    );
  });
});

describe('ratingField typescriptSchema', () => {
  it('gives agents the range as a whole number', () => {
    const field = ratingField({ name: 'score' });

    expect(runSchema(field, { type: ['number', 'null'] })).toEqual({
      type: ['integer', 'null'],
      description: 'Whole-number rating from 1 to 5',
      minimum: 1,
      maximum: 5,
    });
  });

  it('names max and appends the text to the developer description', () => {
    const field = ratingField({ name: 'score', max: 10, admin: { description: 'Fit' } });

    expect(runSchema(field, { type: 'number', description: 'Fit' })).toEqual({
      type: 'integer',
      description: 'Fit (whole-number rating from 1 to 10)',
      minimum: 1,
      maximum: 10,
    });
  });
});

describe('ratingField validate', () => {
  it.each([
    [0, 'validation:lessThanMin'],
    [6, 'validation:greaterThanMax'],
    [3.5, 'Enter a whole number of stars from 1 to 5.'],
    [3, true],
    [null, true],
  ])('validates %o', async (value, expected) => {
    expect(await validateField(ratingField({ name: 'score' }), value)).toBe(expected);
  });

  it('names max in the kind message', async () => {
    expect(await validateField(ratingField({ name: 'score', max: 10 }), 7.5)).toBe(
      'Enter a whole number of stars from 1 to 10.',
    );
  });

  it('runs the developer validate after the kind check', async () => {
    const field = ratingField({ name: 'score', validate: () => 'No threes.' });

    expect(await validateField(field, 3.5)).toBe('Enter a whole number of stars from 1 to 5.');
    expect(await validateField(field, 3)).toBe('No threes.');
  });
});
