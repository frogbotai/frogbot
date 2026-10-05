import { describe, expect, it } from 'vitest';

import {
  applyFieldKind,
  type FieldKindSpec,
  kindTypescriptSchema,
} from '../../../../../packages/frogbot/src/fields/baseFields/applyFieldKind.js';
import type {
  NumberField,
  TextField,
} from '../../../../../packages/frogbot/src/fields/config/types.js';

const spec: FieldKindSpec = {
  kind: { type: 'sample', unit: 'm' },
  description: 'Length in metres',
};

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

describe('applyFieldKind marker', () => {
  it('sets the kind marker on admin.custom.frogbot', () => {
    const field = applyFieldKind({ name: 'length', type: 'number' }, spec);

    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type: 'sample', unit: 'm' } } });
  });

  it('keeps other admin.custom and admin.custom.frogbot keys', () => {
    const field = applyFieldKind(
      {
        name: 'length',
        type: 'number',
        admin: { custom: { other: true, frogbot: { vector: { dimensions: 3 } } } },
      },
      spec,
    );

    expect(field.admin?.custom).toEqual({
      other: true,
      frogbot: { vector: { dimensions: 3 }, kind: { type: 'sample', unit: 'm' } },
    });
  });

  it('replaces an admin.custom.frogbot value that is not an object', () => {
    const field = applyFieldKind(
      { name: 'length', type: 'number', admin: { custom: { frogbot: 'legacy' } } },
      spec,
    );

    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type: 'sample', unit: 'm' } } });
  });
});

describe('applyFieldKind components', () => {
  it('sets the FieldCell list cell and the kind field component', () => {
    const field = applyFieldKind(
      { name: 'length', type: 'number' },
      { ...spec, cell: true, Field: '@frogbotai/next/client#SampleField' },
    );

    expect(field.admin?.components).toEqual({
      Cell: '@frogbotai/next/client#FieldCell',
      Field: '@frogbotai/next/client#SampleField',
    });
  });

  it('keeps the developer Cell and Field over the kind components', () => {
    const field = applyFieldKind(
      {
        name: 'length',
        type: 'number',
        admin: {
          components: { Cell: './Cell#Cell', Field: './Field#Field', Label: './Label#Label' },
        },
      },
      { ...spec, cell: true, Field: '@frogbotai/next/client#SampleField' },
    );

    expect(field.admin?.components).toEqual({
      Cell: './Cell#Cell',
      Field: './Field#Field',
      Label: './Label#Label',
    });
  });

  it('adds no components key when neither the spec nor the field gives one', () => {
    const field = applyFieldKind({ name: 'length', type: 'number' }, spec);

    expect(field.admin).not.toHaveProperty('components');
  });
});

describe('applyFieldKind typescriptSchema', () => {
  it('puts the kind entry first and keeps developer entries in order', () => {
    const calls: string[] = [];

    const field = applyFieldKind(
      {
        name: 'length',
        type: 'number',
        typescriptSchema: [
          ({ jsonSchema }) => {
            calls.push(`first:${jsonSchema.description}`);

            return jsonSchema;
          },
          ({ jsonSchema }) => {
            calls.push('second');

            return jsonSchema;
          },
        ],
      },
      spec,
    );

    runSchema(field, { type: 'number' });

    expect(field.typescriptSchema).toHaveLength(3);
    expect(calls).toEqual(['first:Length in metres', 'second']);
  });

  it('uses the kind text when there is no description', () => {
    const field = applyFieldKind({ name: 'length', type: 'number' }, spec);

    expect(runSchema(field, { type: 'number' })).toEqual({
      type: 'number',
      description: 'Length in metres',
    });
  });

  it('appends the kind text in lowercase after an existing description', () => {
    const field = applyFieldKind({ name: 'length', type: 'number' }, spec);

    expect(runSchema(field, { type: 'number', description: 'Board length' }).description).toBe(
      'Board length (length in metres)',
    );
  });

  it('lets a later developer entry replace the description', () => {
    const field = applyFieldKind(
      {
        name: 'length',
        type: 'number',
        typescriptSchema: [({ jsonSchema }) => ({ ...jsonSchema, description: 'Custom text' })],
      },
      spec,
    );

    expect(runSchema(field, { type: 'number', description: 'Board length' }).description).toBe(
      'Custom text',
    );
  });

  it('adds min and max as schema limits', () => {
    const field = applyFieldKind({ name: 'length', type: 'number', min: 0, max: 10 }, spec);

    expect(runSchema(field, { type: ['number', 'null'] })).toEqual({
      type: ['number', 'null'],
      description: 'Length in metres',
      minimum: 0,
      maximum: 10,
    });
  });

  it('puts limits on items for a hasMany field', () => {
    const field = applyFieldKind(
      { name: 'lengths', type: 'number', hasMany: true, min: 1, max: 5 },
      spec,
    );

    expect(runSchema(field, { type: 'array', items: { type: 'number' } })).toEqual({
      type: 'array',
      description: 'Length in metres',
      items: { type: 'number', minimum: 1, maximum: 5 },
    });
  });

  it('ignores limits that are not numbers', () => {
    const field = applyFieldKind(
      { name: 'title', type: 'text', minLength: 2 } satisfies TextField,
      spec,
    );

    expect(runSchema(field, { type: 'string' })).toEqual({
      type: 'string',
      description: 'Length in metres',
    });
  });

  it('marks a string number type as integer', () => {
    const field = applyFieldKind({ name: 'count', type: 'number' }, { ...spec, integer: true });

    expect(runSchema(field, { type: 'number' }).type).toBe('integer');
  });

  it('marks a nullable number type as integer', () => {
    const field = applyFieldKind({ name: 'count', type: 'number' }, { ...spec, integer: true });

    expect(runSchema(field, { type: ['number', 'null'] }).type).toEqual(['integer', 'null']);
  });

  it('marks hasMany items as integer', () => {
    const field = applyFieldKind(
      { name: 'counts', type: 'number', hasMany: true },
      { ...spec, integer: true },
    );

    expect(runSchema(field, { type: 'array', items: { type: 'number' } })).toEqual({
      type: 'array',
      description: 'Length in metres',
      items: { type: 'integer' },
    });
  });
});

describe('applyFieldKind input', () => {
  it('leaves admin.description and the input field unchanged', () => {
    const entry = kindTypescriptSchema({ text: 'Other' });

    const input: NumberField = {
      name: 'length',
      type: 'number',
      admin: { description: 'Board length', custom: { other: true } },
      typescriptSchema: [entry],
    };

    const snapshot = structuredClone({ ...input, typescriptSchema: undefined });

    const field = applyFieldKind(input, { ...spec, cell: true });

    expect(field.admin?.description).toBe('Board length');
    expect({ ...input, typescriptSchema: undefined }).toEqual(snapshot);
    expect(input.typescriptSchema).toEqual([entry]);
    expect(input.admin).not.toHaveProperty('components');
  });
});
