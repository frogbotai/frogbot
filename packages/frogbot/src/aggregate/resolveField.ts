import type { FieldAccess, FlattenedField, Payload, SanitizedCollectionConfig } from 'payload';

import type { AggregateFieldType } from './types.js';

export type AggregateFieldHop = {
  collection: string;
  prefix: string;
  /** The hop can reach several related documents per document, through `hasMany` or an array. */
  many: boolean;
};

export type ResolvedAggregateField = {
  field: FlattenedField;
  type: AggregateFieldType | undefined;
  hops: AggregateFieldHop[];
  many: boolean;
  hidden: boolean;
  /** The `access.read` rule of every field the path crosses, with the collection that holds it. */
  readAccess: { collection: SanitizedCollectionConfig; read: FieldAccess }[];
};

function getFieldType(field: FlattenedField): AggregateFieldType | undefined {
  if ('virtual' in field && field.virtual) return undefined;

  switch (field.type) {
    case 'checkbox':
      return 'boolean';
    case 'date':
      return 'date';
    case 'number':
      return field.name === 'id' ? 'id' : 'number';
    case 'email':
    case 'radio':
    case 'select':
    case 'text':
    case 'textarea':
      return field.name === 'id' ? 'id' : 'string';
    case 'relationship':
    case 'upload':
      return typeof field.relationTo === 'string' ? 'id' : undefined;
    default:
      return undefined;
  }
}

function findField(
  fields: FlattenedField[],
  segment: string,
  documentLevel: boolean,
): FlattenedField | undefined {
  const field = fields.find((candidate) => candidate.name === segment);

  if (field || segment !== 'id' || !documentLevel) return field;

  return { name: 'id', type: 'text' };
}

/** Walks a dot path through groups, arrays and single-collection relationships, noting what it crosses. */
export function resolveAggregateField({
  collection,
  path,
  payload,
}: {
  collection: SanitizedCollectionConfig;
  path: string;
  payload: Payload;
}): ResolvedAggregateField | undefined {
  const segments = path.split('.');
  const hops: AggregateFieldHop[] = [];

  let documentLevel = true;
  let fields = collection.flattenedFields;
  let many = false;
  let hidden = false;
  const readAccess: ResolvedAggregateField['readAccess'] = [];
  let owner = collection;

  for (const [index, segment] of segments.entries()) {
    const field = findField(fields, segment, documentLevel);

    if (!field) return undefined;

    hidden ||= 'hidden' in field && field.hidden === true;
    if ('access' in field && field.access?.read) {
      readAccess.push({ collection: owner, read: field.access.read });
    }

    const rest = segments.slice(index + 1);
    const isRelationship = field.type === 'relationship' || field.type === 'upload';

    if (!rest.length || (isRelationship && rest.length === 1 && rest[0] === 'id')) {
      many ||= 'hasMany' in field && field.hasMany === true;

      return { field, type: getFieldType(field), hops, many, hidden, readAccess };
    }

    if (field.type === 'group' || field.type === 'tab' || field.type === 'array') {
      many ||= field.type === 'array';
      fields = field.flattenedFields;
      documentLevel = false;

      continue;
    }

    if (!isRelationship || typeof field.relationTo !== 'string') return undefined;

    const related = payload.collections[field.relationTo]?.config;

    if (!related) return undefined;

    many ||= field.hasMany === true;
    fields = related.flattenedFields;
    owner = related;
    documentLevel = true;
    hops.push({ collection: related.slug, prefix: segments.slice(0, index + 1).join('.'), many });
  }

  return undefined;
}

/** Every field path a `where` names, including those inside `and` and `or`. */
export function getWherePaths(where: unknown): string[] {
  const paths = new Set<string>();

  function visit(predicate: unknown): void {
    if (!predicate || typeof predicate !== 'object') return;

    for (const [key, value] of Object.entries(predicate)) {
      if (['and', 'or'].includes(key.toLowerCase()) && Array.isArray(value)) {
        for (const item of value) visit(item);

        continue;
      }

      paths.add(key);
    }
  }

  visit(where);

  return [...paths];
}
