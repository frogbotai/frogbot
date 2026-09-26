import type { SearchCollection, SearchIndexDescriptor } from '../../../types.js';
import type { SearchSchema, SearchTarget, SQLiteSearchAdapter } from '../types.js';
import { buildSearchObjects } from './buildSearchObjects.js';
import { getSearchTarget } from './getSearchTarget.js';

const shadowSuffixes = ['_config', '_content', '_data', '_docsize', '_idx', '_shadow'];

export function getSearchTargets({
  adapter,
  collection: slug,
  index,
}: {
  adapter: SQLiteSearchAdapter;
  collection: string;
  index: SearchIndexDescriptor;
}): SearchTarget[] {
  const collection = adapter.payload.collections[slug]?.config;

  if (!collection) return [];

  return [false, ...(collection.versions?.drafts ? [true] : [])].map((versions) =>
    getSearchTarget({ adapter, collection: slug, index, versions }),
  );
}

export function getSearchSchema({
  adapter,
  collections,
}: {
  adapter: SQLiteSearchAdapter;
  collections: SearchCollection[];
}): SearchSchema {
  const schema: SearchSchema = {};
  const owners = new Map<string, string>();

  for (const { slug, search } of collections) {
    for (const index of Object.values(search)) {
      for (const target of getSearchTargets({ adapter, collection: slug, index })) {
        const group = buildSearchObjects(target);

        if (!group) continue;

        if (schema[target.name]) {
          throw new Error(
            `[frogbot] Search index '${index.name}' in collection '${slug}' conflicts with another search index on database object '${target.name}'.`,
          );
        }
        const names = [
          target.name,
          ...group.objects.flatMap(({ name }) => [
            name,
            ...shadowSuffixes.map((suffix) => `${name}${suffix}`),
          ]),
        ];

        for (const name of names) {
          const owner = owners.get(name);

          if (owner && owner !== target.name) {
            throw new Error(
              `[frogbot] Search index '${index.name}' in collection '${slug}' conflicts with another search index on database object '${name}'.`,
            );
          }

          owners.set(name, target.name);
        }

        schema[target.name] = group;
      }
    }
  }

  return schema;
}
