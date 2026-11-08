import { getDocumentThumbnail } from '@payloadcms/ui/utilities/getDocumentThumbnail';
import { getDocumentThumbnailPopulate } from '@payloadcms/ui/utilities/getDocumentThumbnailPopulate';
import type { CardViewConfig } from 'frogbot';
import type { PopulateType, SanitizedCollectionConfig } from 'payload';

/**
 * A card view's image: `false` for none, otherwise the upload field to read and how to fit it.
 * `field` is unset when the collection has no upload field, so an upload collection's cards show
 * their own file.
 */
export type CardThumbnail = false | { field?: string; fit: 'contain' | 'cover' };

/**
 * The view's `useAsThumbnail` wins, `false` turns images off, and unset falls back to the
 * collection's, which Payload has already validated and defaulted to its first upload field.
 */
export function resolveCardThumbnail({
  collectionConfig,
  view,
}: {
  collectionConfig: Pick<SanitizedCollectionConfig, 'admin'>;
  view: CardViewConfig;
}): CardThumbnail {
  if (view.useAsThumbnail === false) return false;
  const field = view.useAsThumbnail ?? collectionConfig.admin.useAsThumbnail;

  return { ...(field ? { field } : {}), fit: view.thumbnailFit ?? 'cover' };
}

/** Payload's `populate` for the resolved image field, so its upload loads with what a card needs. */
export function getCardThumbnailPopulate({
  collectionConfig,
  collections,
  thumbnail,
}: {
  collectionConfig: SanitizedCollectionConfig;
  collections: SanitizedCollectionConfig[];
  thumbnail: CardThumbnail;
}): PopulateType | undefined {
  if (!thumbnail || !thumbnail.field) return undefined;

  return getDocumentThumbnailPopulate({
    collectionConfig: {
      ...collectionConfig,
      admin: { ...collectionConfig.admin, useAsThumbnail: thumbnail.field },
    },
    collections,
  });
}

/** The card's image URL from Payload's `getDocumentThumbnail`, or `undefined` for none. */
export function getCardThumbnailURL(
  doc: Record<string, unknown>,
  thumbnail: CardThumbnail,
): string | undefined {
  if (!thumbnail) return undefined;

  return getDocumentThumbnail({ doc, useAsThumbnail: thumbnail.field });
}
