import type { SanitizedConfig } from 'payload';

const hiddenCollections = new Set([
  'payload-jobs',
  'payload-kv',
  'payload-locked-documents',
  'payload-preferences',
]);

const hiddenGlobals = new Set(['payload-jobs-stats']);

export function hideBuiltInGraphQL(built: SanitizedConfig): void {
  for (const collection of built.collections) {
    if (hiddenCollections.has(collection.slug)) collection.graphQL = false;
  }

  for (const global of built.globals) {
    if (hiddenGlobals.has(global.slug)) global.graphQL = false;
  }
}
