import type { MongooseAdapter } from '@payloadcms/db-mongodb';

const VALUE_TYPES = ['number', 'string', 'objectId', 'bool', 'date', 'object', 'array', 'binData'];

/**
 * SQL unique indexes let many rows leave a column null; Mongo indexes a missing
 * value as null, so two records without one collide. A unique compound index with
 * an optional field becomes partial, indexing only records that have every value,
 * like Payload's `sparse` on a single optional unique field.
 */
export function installPartialCompoundIndexes(database: MongooseAdapter) {
  const init = database.init!;

  database.init = async function (...args) {
    await init.apply(this, args);

    const { localization } = database.payload.config;

    for (const collection of database.payload.config.collections) {
      const schema = database.collections[collection.slug]?.schema;

      for (const index of collection.sanitizedIndexes) {
        if (!schema || !index.unique || index.fields.length < 2) continue;
        if (index.fields.every(({ field }) => 'required' in field && field.required)) continue;

        const spec: Record<string, 1> = {};

        for (const { localizedPath, path, pathHasLocalized } of index.fields) {
          if (pathHasLocalized && localization) {
            for (const { code } of localization.locales) {
              spec[localizedPath.replace('<locale>', code)] = 1;
            }
          } else {
            spec[path] = 1;
          }
        }

        schema.removeIndex(spec);

        schema.index(spec, {
          unique: true,
          partialFilterExpression: Object.fromEntries(
            Object.keys(spec).map((path) => [path, { $type: VALUE_TYPES }]),
          ),
        });
      }
    }
  };
}
