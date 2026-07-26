import { mergeCollection } from '../collections/mergeCollection.js';
import { validateCollectionMarkers } from '../collections/validateMarkers.js';
import type { CollectionConfig } from '../types/collection.js';
import type { SanitizedFilesConfig } from '../types/files.js';
import { defaultFilesCollection } from './collection.js';

export const DEFAULT_FILES_SLUG = 'files';

export type ResolveFilesCollectionProps = {
  collections: CollectionConfig[];
};

export function resolveFilesCollection({ collections }: ResolveFilesCollectionProps): {
  collections: CollectionConfig[];
  files: SanitizedFilesConfig;
} {
  validateCollectionMarkers(collections);
  const marked = collections.filter((collection) => collection.file === true);
  if (marked.length > 1) {
    throw new Error(
      `[frogbot] Multiple collections marked \`file: true\` (${marked.map((collection) => collection.slug).join(', ')}). Mark exactly one.`,
    );
  }

  const existing = marked[0];
  const slug = existing?.slug ?? DEFAULT_FILES_SLUG;
  if (existing) {
    if (existing.upload === false) {
      throw new Error(`[frogbot] Files collection '${slug}' cannot set \`upload: false\`.`);
    }
    const resolved = [...collections];
    resolved[collections.indexOf(existing)] = mergeCollection({
      user: existing,
      base: defaultFilesCollection({ slug }),
      reservedFields: [],
      feature: 'files',
    });
    return { collections: resolved, files: { slug } };
  }

  if (collections.some((collection) => collection.slug === slug)) {
    throw new Error(
      `[frogbot] Collection slug '${slug}' conflicts with the default files collection. Add \`file: true\` to adopt it, or rename it.`,
    );
  }
  return {
    collections: [...collections, defaultFilesCollection({ slug })],
    files: { slug },
  };
}
