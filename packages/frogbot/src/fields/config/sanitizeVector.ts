import {
  type Field as PayloadField,
  type JSONField as PayloadJSONField,
  ValidationError,
} from 'payload';

import type { MapVectorField } from '../../database/types.js';
import { validateVector } from '../validations.js';
import { FIELD_CELL_PATH, sanitizeOptionColors } from './sanitizeOptionColors.js';
import { getSystemKind, sanitizeSystemKind, type SystemKindUsers } from './sanitizeSystemKinds.js';
import type { Field, VectorField } from './types.js';

type VectorOwner =
  { block?: undefined; collection: string } | { block: string; collection?: undefined };

type SanitizeVectorFieldsArgs = VectorOwner & {
  fields: readonly Field[];
  mapVectorField?: MapVectorField;
  onAutonumber?: (path: string) => void;
  users: SystemKindUsers;
};

type SanitizeVectorFieldArgs = VectorOwner & {
  field: VectorField;
  mapVectorField?: MapVectorField;
  path: string;
};

function joinPath(parent: string, name: string): string {
  return [parent, name].filter(Boolean).join('.');
}

function sanitizeVectorField({
  block,
  collection,
  field,
  mapVectorField,
  path,
}: SanitizeVectorFieldArgs): PayloadField {
  const { dimensions, validate, ...rest } = field;

  if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
    const owner = collection ? `collection '${collection}'` : `block '${block}'`;

    throw new Error(
      `[frogbot] Vector field '${path}' in ${owner} requires positive integer dimensions.`,
    );
  }

  const existingCustom = field.custom ?? {};
  const frogbot = existingCustom.frogbot;

  const vectorValidate: PayloadJSONField['validate'] = async (value, options) => {
    const result = validateVector(value, dimensions, Boolean(options.required));

    if (result !== true) return result;

    return validate ? validate(value as number[] | null | undefined, options as never) : true;
  };

  const vectorSchema: NonNullable<PayloadJSONField['typescriptSchema']>[number] = ({
    jsonSchema,
  }) => ({
    ...jsonSchema,
    type: field.required ? 'array' : ['array', 'null'],
    items: { type: 'number' },
  });

  const validateStoredVector: NonNullable<
    NonNullable<PayloadJSONField['hooks']>['beforeChange']
  >[number] = ({ path: fieldPath, value }) => {
    const result = validateVector(value, dimensions, false);

    if (result !== true) {
      throw new ValidationError({
        ...(collection ? { collection } : {}),
        errors: [{ message: result, path: fieldPath.join('.') }],
      });
    }
  };

  const lowered = {
    ...rest,
    type: 'json',
    validate: vectorValidate,
    custom: {
      ...existingCustom,
      frogbot: {
        ...(frogbot && typeof frogbot === 'object' ? frogbot : {}),
        vector: { dimensions },
      },
    },
    hooks: {
      ...field.hooks,
      beforeChange: [...(field.hooks?.beforeChange ?? []), validateStoredVector],
    },
    typescriptSchema: [...(field.typescriptSchema ?? []), vectorSchema],
  } as unknown as PayloadJSONField;

  if (!mapVectorField) return lowered;

  return mapVectorField({ collection, block, dimensions, field: lowered, path });
}

function sanitizeVirtualPath(field: Field): Field {
  if (!('virtual' in field) || typeof field.virtual !== 'string') return field;

  const admin = ('admin' in field ? field.admin : undefined) as
    { components?: { Cell?: unknown } } | undefined;

  if (admin?.components?.Cell) return field;

  return {
    ...field,
    admin: { ...admin, components: { ...admin?.components, Cell: FIELD_CELL_PATH } },
  } as Field;
}

function sanitizeFields(
  args: SanitizeVectorFieldsArgs,
  parent: string,
  repeated: boolean,
): Field[] {
  return args.fields.map((input) => {
    const field = sanitizeVirtualPath(input);
    const path = 'name' in field ? joinPath(parent, field.name) : parent;
    const systemKind = getSystemKind(field);

    if (systemKind) {
      return sanitizeSystemKind({ ...args, ...systemKind, field, path, repeated });
    }

    if (field.type === 'vector') {
      return sanitizeVectorField({ ...args, field, path }) as unknown as Field;
    }

    if (field.type === 'select' || field.type === 'radio') {
      return sanitizeOptionColors({ ...args, field, path });
    }

    if ('fields' in field && Array.isArray(field.fields)) {
      return {
        ...field,
        fields: sanitizeFields(
          { ...args, fields: field.fields },
          path,
          repeated || field.type === 'array',
        ),
      };
    }

    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) => ({
          ...tab,
          fields: sanitizeFields(
            { ...args, fields: tab.fields },
            joinPath(parent, 'name' in tab && tab.name ? tab.name : ''),
            repeated,
          ),
        })),
      };
    }

    if (field.type === 'blocks') {
      const sanitizeBlock = <T extends { fields: Field[]; slug: string }>(block: T): T => ({
        ...block,
        fields: sanitizeFields({ ...args, fields: block.fields }, joinPath(path, block.slug), true),
      });

      return {
        ...field,
        blocks: field.blocks.map(sanitizeBlock),
        blockReferences: field.blockReferences?.map((block) =>
          typeof block === 'string' ? block : sanitizeBlock(block),
        ),
      };
    }

    return field;
  });
}

export function sanitizeVectorFields(args: SanitizeVectorFieldsArgs): Field[] {
  return sanitizeFields(args, '', args.block !== undefined);
}
