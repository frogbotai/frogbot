import { buildIndexName, type DrizzleAdapter } from '@payloadcms/drizzle';
import type { BasePostgresAdapter } from '@payloadcms/drizzle/postgres';
import { type ExtraConfigColumn, index as pgIndex, type PgIndexOpClass } from 'drizzle-orm/pg-core';
import toSnakeCase from 'to-snake-case';

import type { BuildSearchSchema } from '../../../database/types.js';
import type { SearchIndexDescriptor, SearchMetric } from '../../types.js';
import { resolveSearchColumn, type SearchColumn } from '../resolveSearchColumn.js';
import { buildTSVector } from './buildTSVector.js';
import { createVectorExtension } from './createVectorExtension.js';

export const maxHNSWDimensions = 2000;

const operatorClasses: Record<SearchMetric, PgIndexOpClass> = {
  cosine: 'vector_cosine_ops',
  dotProduct: 'vector_ip_ops',
  euclidean: 'vector_l2_ops',
};

type SearchIndexPlan =
  | { type: 'hnsw'; key: string; name: string; operatorClass: PgIndexOpClass; tableName: string }
  | { type: 'gin'; keys: string[]; language: string | undefined; name: string; tableName: string };

function resolveColumn({
  adapter,
  collection,
  index,
  path,
  versions,
}: {
  adapter: DrizzleAdapter;
  collection: string;
  index: SearchIndexDescriptor;
  path: string;
  versions: boolean;
}): SearchColumn {
  const column = resolveSearchColumn({ adapter, collection, path, versions });

  if (!column) {
    throw new Error(
      `[frogbot] Search index '${index.name}' in collection '${collection}': field '${path}' has no database column.`,
    );
  }

  return column;
}

export const buildSchema: BuildSearchSchema = ({ collections, db }) => {
  const adapter = db as unknown as BasePostgresAdapter;
  const drizzleAdapter = db as unknown as DrizzleAdapter;
  const plans = new Map<string, SearchIndexPlan>();

  adapter.beforeSchemaInit.push(({ schema }) => {
    for (const { slug, search } of collections) {
      const versioned = adapter.payload.collections[slug]?.config.versions;

      for (const index of Object.values(search)) {
        for (const versions of versioned ? [false, true] : [false]) {
          const searchable = !versions || Boolean(versioned && versioned.drafts);

          if (index.vector) {
            const { approximate, dimensions, metric, path } = index.vector;
            const { key, tableName } = resolveColumn({
              adapter: drizzleAdapter,
              collection: slug,
              index,
              path,
              versions,
            });

            const { name, notNull } = adapter.rawTables[tableName].columns[key];

            adapter.rawTables[tableName].columns[key] = {
              name,
              notNull,
              type: 'vector',
              dimensions,
            };

            const operatorClass = operatorClasses[metric];
            const id = `hnsw:${tableName}:${key}:${operatorClass}`;

            if (searchable && approximate && dimensions <= maxHNSWDimensions && !plans.has(id)) {
              plans.set(id, {
                type: 'hnsw',
                key,
                name: buildIndexName({
                  adapter: drizzleAdapter,
                  name: `${tableName}_${name}_${toSnakeCase(metric)}`,
                }),
                operatorClass,
                tableName,
              });
            }
          }

          if (index.lexical && searchable) {
            const columns = index.lexical.fields.map(({ path }) =>
              resolveColumn({ adapter: drizzleAdapter, collection: slug, index, path, versions }),
            );

            const [{ tableName }] = columns;
            const keys = columns.map(({ key }) => key);
            const id = `gin:${tableName}:${index.lexical.language ?? ''}:${keys.join(',')}`;

            if (columns.every((column) => column.tableName === tableName) && !plans.has(id)) {
              plans.set(id, {
                type: 'gin',
                keys,
                language: index.lexical.language,
                name: buildIndexName({
                  adapter: drizzleAdapter,
                  name: `${tableName}_${toSnakeCase(index.name)}_search`,
                }),
                tableName,
              });
            }
          }
        }
      }
    }

    return schema;
  });

  adapter.afterSchemaInit.push(({ extendTable, schema }) => {
    for (const plan of plans.values()) {
      extendTable({
        table: schema.tables[plan.tableName],
        extraConfig: (table) => {
          const columns = table as unknown as Record<string, ExtraConfigColumn>;

          return {
            [plan.name]:
              plan.type === 'hnsw'
                ? pgIndex(plan.name).using('hnsw', columns[plan.key].op(plan.operatorClass))
                : pgIndex(plan.name).using(
                    'gin',
                    buildTSVector({
                      columns: plan.keys.map((key) => columns[key]),
                      language: plan.language,
                    }),
                  ),
          };
        },
      });
    }

    return schema;
  });

  const vectorIndex = collections
    .flatMap(({ slug, search }) =>
      Object.values(search).map((index) => ({ collection: slug, index })),
    )
    .find(({ index }) => index.vector);

  if (!vectorIndex) return;

  const createExtensions = adapter.createExtensions;

  adapter.createExtensions = async function (this: BasePostgresAdapter) {
    await createVectorExtension({
      adapter,
      collection: vectorIndex.collection,
      index: vectorIndex.index.name,
    });

    await createExtensions.call(this);
  };
};
