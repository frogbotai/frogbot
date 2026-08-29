import type { CollectionConfig } from './types.js';
import { mergeCollection } from './merge.js';

type CollectionMarker = 'chat' | 'message' | 'usageLog';

type ResolveMarkedCollectionProps = {
  collectionLabel: string;
  collections: CollectionConfig[];
  defaultCollection: CollectionConfig;
  existing?: CollectionConfig;
  feature: string;
  marker: CollectionMarker;
  reservedFields: string[];
};

export function resolveMarkedCollection({
  collectionLabel,
  collections,
  defaultCollection,
  existing,
  feature,
  marker,
  reservedFields,
}: ResolveMarkedCollectionProps): CollectionConfig[] {
  if (existing) {
    const resolved = [...collections];
    resolved[collections.indexOf(existing)] = mergeCollection({
      user: existing,
      base: defaultCollection,
      reservedFields,
      feature,
    });
    return resolved;
  }

  if (collections.some(({ slug }) => slug === defaultCollection.slug)) {
    throw new Error(
      `[frogbot] Collection slug '${defaultCollection.slug}' conflicts with the default ${collectionLabel} collection. ` +
        `Add \`${marker}: true\` to adopt it, or rename it.`,
    );
  }

  return [...collections, defaultCollection];
}
