import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { FlattenedField } from 'payload';

type PipelineStage = Record<string, unknown>;

export type ResolvedPath = {
  /** The field path on each document once `stages` have run. */
  path: string;
  /** `$unwind` and `$lookup` stages that give each array value and related document its own row. */
  stages: PipelineStage[];
};

function findField(
  fields: FlattenedField[],
  segment: string,
  documentLevel: boolean,
): FlattenedField | undefined {
  const field = fields.find((candidate) => candidate.name === segment);

  if (field || segment !== 'id' || !documentLevel) return field;

  return { name: 'id', type: 'text' };
}

/**
 * Walks a dot path the way `resolveAggregateField` does. Arrays, `hasMany` values and relationship
 * hops are copied into `alias`-prefixed fields before they unwind, so each group path unwinds on
 * its own and the document's stored fields stay as they are for the totals.
 */
export function resolvePath({
  adapter,
  alias,
  collection,
  locale,
  path,
}: {
  adapter: MongooseAdapter;
  alias: string;
  collection: string;
  locale: string | undefined;
  path: string;
}): ResolvedPath {
  const segments = path.split('.');
  const stages: PipelineStage[] = [];

  let fields = adapter.payload.collections[collection].config.flattenedFields;
  let documentLevel = true;
  let current = '';
  let copies = 0;

  const unwind = (source: string): string => {
    const name = `${alias}_${copies++}`;

    stages.push(
      { $addFields: { [name]: `$${source}` } },
      { $unwind: { path: `$${name}`, preserveNullAndEmptyArrays: true } },
    );

    return name;
  };

  for (const [index, segment] of segments.entries()) {
    const field = findField(fields, segment, documentLevel);

    if (!field) throw new Error(`[frogbot] Aggregate cannot resolve '${path}' on '${collection}'.`);

    const name = documentLevel && field.name === 'id' ? '_id' : field.name;

    current = current ? `${current}.${name}` : name;

    if ('localized' in field && field.localized && locale) current = `${current}.${locale}`;

    const rest = segments.slice(index + 1);
    const isRelationship = field.type === 'relationship' || field.type === 'upload';
    const hasMany = 'hasMany' in field && field.hasMany === true;

    if (!rest.length || (isRelationship && rest.length === 1 && rest[0] === 'id')) {
      return { path: hasMany ? unwind(current) : current, stages };
    }

    if (field.type === 'group' || field.type === 'tab') {
      fields = field.flattenedFields;
      documentLevel = false;

      continue;
    }

    if (field.type === 'array') {
      current = unwind(current);
      fields = field.flattenedFields;
      documentLevel = false;

      continue;
    }

    if (!isRelationship || typeof field.relationTo !== 'string') {
      throw new Error(`[frogbot] Aggregate cannot resolve '${path}' on '${collection}'.`);
    }

    const related = adapter.collections[field.relationTo];
    const localField = hasMany ? unwind(current) : current;
    const as = `${alias}_${copies++}`;

    stages.push(
      {
        $lookup: { from: related.collection.name, localField, foreignField: '_id', as },
      },
      { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
    );

    current = as;
    fields = adapter.payload.collections[field.relationTo].config.flattenedFields;
    documentLevel = true;
  }

  return { path: current, stages };
}
