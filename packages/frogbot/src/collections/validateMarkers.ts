import { COLLECTION_MARKERS } from '../types/collection.js';
import type { CollectionConfig } from '../types/collection.js';

export function validateCollectionMarkers(collections: CollectionConfig[]): void {
  for (const collection of collections) {
    const markers = COLLECTION_MARKERS.filter((marker) => collection[marker] === true);
    if (markers.length > 1) {
      throw new Error(
        `[frogbot] Collection '${collection.slug}' is marked as multiple roles (${markers.join(', ')}). Pick one.`,
      );
    }
  }
}
