import { describe, expect, it, vi } from 'vitest';

import { urlField } from '../../../../../packages/frogbot/src/fields/baseFields/url/index.js';
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

const message = 'Enter a web address such as https://example.com.';

describe('urlField', () => {
  it('returns a text field marked as a URL', () => {
    const field = urlField({ name: 'website' });

    expect(field.type).toBe('text');
    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type: 'url' } } });
  });

  it('uses FieldCell for the list cell and the text input for editing', () => {
    const field = urlField({ name: 'website' });

    expect(field.admin?.components).toEqual({ Cell: '@frogbotai/next/client#FieldCell' });
  });

  it('passes text field options through unchanged', () => {
    const access = { update: () => false };
    const afterRead = () => 'example.com';
    const developerEntry: NonNullable<TextField['typescriptSchema']>[number] = ({ jsonSchema }) =>
      jsonSchema;

    const field = urlField({
      name: 'website',
      label: 'Website',
      minLength: 5,
      maxLength: 200,
      required: true,
      defaultValue: 'example.com',
      access,
      hooks: { afterRead: [afterRead] },
      admin: { readOnly: true, placeholder: 'example.com', custom: { other: true } },
      typescriptSchema: [developerEntry],
    });

    expect(field).toMatchObject({
      name: 'website',
      label: 'Website',
      minLength: 5,
      maxLength: 200,
      required: true,
      defaultValue: 'example.com',
      access,
      hooks: { afterRead: [afterRead] },
      admin: {
        readOnly: true,
        placeholder: 'example.com',
        custom: { other: true, frogbot: { kind: { type: 'url' } } },
      },
    });

    expect(field.typescriptSchema).toHaveLength(2);
    expect(field.typescriptSchema?.[1]).toBe(developerEntry);
  });
});

describe('urlField option errors', () => {
  it.each([
    [{ hasMany: true }, 'urlField "website": hasMany is not supported'],
    [{ minRows: 1 }, 'urlField "website": minRows is not supported'],
    [{ maxRows: 2 }, 'urlField "website": maxRows is not supported'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => urlField({ name: 'website', ...(options as object) })).toThrow(new Error(message));
  });
});

describe('urlField typescriptSchema', () => {
  it('describes the value to agents when there is no description', () => {
    const field = urlField({ name: 'website' });

    expect(runSchema(field, { type: ['string', 'null'] })).toEqual({
      type: ['string', 'null'],
      description: 'Web address, for example https://example.com or example.com',
    });
  });

  it('appends the URL text to the developer description', () => {
    const field = urlField({ name: 'website', admin: { description: 'Home page' } });

    expect(runSchema(field, { type: 'string', description: 'Home page' }).description).toBe(
      'Home page (web address, for example https://example.com or example.com)',
    );
  });
});

describe('urlField validate', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['example.com/pricing', true],
    ['javascript:alert(1)', message],
    ['mailto:a@b.com', message],
    ['a b.com', message],
    ['localhost:3000', message],
    [null, true],
    ['', true],
  ])('validates %j', async (value, expected) => {
    expect(await validateField(urlField({ name: 'website' }), value)).toBe(expected);
  });

  it('keeps the developer length limits', async () => {
    const field = urlField({ name: 'website', minLength: 12, maxLength: 20 });

    expect(await validateField(field, 'a.co')).toBe('validation:longerThanMin');
    expect(await validateField(field, 'example.com/a-long-path')).toBe('validation:shorterThanMax');
    expect(await validateField(field, 'example.com/x')).toBe(true);
  });

  it('keeps required when the developer passes a validate', async () => {
    const validate = vi.fn(() => true as const);
    const field = urlField({ name: 'website', required: true, validate });

    expect(await validateField(field, null)).toBe('validation:required');
    expect(validate).not.toHaveBeenCalled();
  });

  it('runs the developer validate after the kind check', async () => {
    const field = urlField({ name: 'website', validate: () => 'No links.' });

    expect(await validateField(field, 'javascript:alert(1)')).toBe(message);
    expect(await validateField(field, 'example.com')).toBe('No links.');
  });
});
