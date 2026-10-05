import type { Field, TextField, UIField } from '../config/types.js';

type KindField = Exclude<Extract<Field, { name: string }>, UIField>;

type TypescriptSchemaEntry = NonNullable<TextField['typescriptSchema']>[number];

type JSONSchema = ReturnType<TypescriptSchemaEntry>;

export type FieldKindSpec = {
  kind: { type: string } & Record<string, unknown>;
  cell?: true;
  Field?: string;
  description: string;
  integer?: boolean;
};

export type KindTypescriptSchemaArgs = {
  text: string;
  min?: number;
  max?: number;
  hasMany?: boolean;
  integer?: boolean;
};

const FIELD_CELL_PATH = '@frogbotai/next/client#FieldCell';

function toInteger(type: JSONSchema['type']): JSONSchema['type'] {
  if (type === 'number') return 'integer';

  if (Array.isArray(type)) return type.map((name) => (name === 'number' ? 'integer' : name));

  return type;
}

function withLimits({
  integer,
  max,
  min,
  schema,
}: {
  integer?: boolean;
  max?: number;
  min?: number;
  schema: JSONSchema;
}): JSONSchema {
  return {
    ...schema,
    ...(min === undefined ? {} : { minimum: min }),
    ...(max === undefined ? {} : { maximum: max }),
    ...(integer ? { type: toInteger(schema.type) } : {}),
  };
}

export function kindTypescriptSchema({
  hasMany,
  integer,
  max,
  min,
  text,
}: KindTypescriptSchemaArgs): TypescriptSchemaEntry {
  return ({ jsonSchema }) => {
    const description = jsonSchema.description
      ? `${jsonSchema.description} (${text[0].toLowerCase()}${text.slice(1)})`
      : text;

    const items = jsonSchema.items;

    if (hasMany && items && !Array.isArray(items)) {
      return {
        ...jsonSchema,
        description,
        items: withLimits({ integer, max, min, schema: items }),
      };
    }

    return withLimits({ integer, max, min, schema: { ...jsonSchema, description } });
  };
}

export function applyFieldKind<TField extends KindField>(
  field: TField,
  spec: FieldKindSpec,
): TField {
  const admin = field.admin ?? {};
  const custom = admin.custom ?? {};
  const frogbot = custom.frogbot;

  const components = {
    ...(spec.cell ? { Cell: FIELD_CELL_PATH } : {}),
    ...(spec.Field ? { Field: spec.Field } : {}),
    ...admin.components,
  };

  const min = 'min' in field && typeof field.min === 'number' ? field.min : undefined;
  const max = 'max' in field && typeof field.max === 'number' ? field.max : undefined;
  const hasMany = 'hasMany' in field && field.hasMany === true;

  const kindEntry = kindTypescriptSchema({
    text: spec.description,
    min,
    max,
    hasMany,
    integer: spec.integer,
  });

  return {
    ...field,
    admin: {
      ...admin,
      custom: {
        ...custom,
        frogbot: {
          ...(frogbot && typeof frogbot === 'object' ? frogbot : {}),
          kind: spec.kind,
        },
      },
      ...(Object.keys(components).length > 0 ? { components } : {}),
    },
    typescriptSchema: [kindEntry, ...(field.typescriptSchema ?? [])],
  };
}
