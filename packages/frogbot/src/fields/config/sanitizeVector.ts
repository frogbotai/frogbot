import {
  type Field as PayloadField,
  type JSONField as PayloadJSONField,
  ValidationError,
} from 'payload';

import type { MapVectorField } from '../../database/types.js';
import { validateVector } from '../validations.js';
import type { Field, VectorField } from './types.js';

type VectorOwner =
  { block?: undefined; collection: string } | { block: string; collection?: undefined };

type SanitizeVectorFieldsArgs = VectorOwner & {
  fields: readonly Field[];
  mapVectorField?: MapVectorField;
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

function sanitizeFields(args: SanitizeVectorFieldsArgs, parent: string): Field[] {
  return args.fields.map((field) => {
    const path = 'name' in field ? joinPath(parent, field.name) : parent;

    if (field.type === 'vector') {
      return sanitizeVectorField({ ...args, field, path }) as unknown as Field;
    }

    if ('fields' in field && Array.isArray(field.fields)) {
      return { ...field, fields: sanitizeFields({ ...args, fields: field.fields }, path) };
    }

    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) => ({
          ...tab,
          fields: sanitizeFields(
            { ...args, fields: tab.fields },
            joinPath(parent, 'name' in tab && tab.name ? tab.name : ''),
          ),
        })),
      };
    }

    if (field.type === 'blocks') {
      const sanitizeBlock = <T extends { fields: Field[]; slug: string }>(block: T): T => ({
        ...block,
        fields: sanitizeFields({ ...args, fields: block.fields }, joinPath(path, block.slug)),
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
  return sanitizeFields(args, '');
}
