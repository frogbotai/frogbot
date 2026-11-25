import { cascadeDelete } from '../collections/config/cascadeDelete.js';
import { resolveMarkedCollection } from '../collections/config/resolveMarkedCollection.js';
import type { CollectionConfig } from '../collections/config/types.js';
import { toPayloadRequest } from '../seams/request.js';
import {
  DEFAULT_SPACES_SLUG,
  defaultSpacesCollection,
  SPACE_FILES_SLUG,
  spaceBase,
  spaceFilesCollection,
} from './collections.js';

export type ResolvedSpaces = { slug: string; filesSlug: string };

/** Finds the collection marked `space: true`, if any, and the slug Spaces will use. */
export function spacesSlugFor(collections: CollectionConfig[]): string {
  const marked = collections.filter((collection) => collection.space === true);

  if (marked.length > 1) {
    throw new Error(
      `[frogbot] Multiple collections marked \`space: true\` (${marked.map((c) => c.slug).join(', ')}). Mark exactly one.`,
    );
  }

  return marked[0]?.slug ?? DEFAULT_SPACES_SLUG;
}

function withSpaceDelete(
  config: CollectionConfig,
  { chatsSlug }: { chatsSlug: string },
): CollectionConfig {
  const files = cascadeDelete(config, { collection: SPACE_FILES_SLUG, field: 'space' });

  return {
    ...files,
    hooks: {
      ...files.hooks,
      beforeDelete: [
        ...(files.hooks?.beforeDelete ?? []),
        async ({ id, req }) => {
          const { payload } = toPayloadRequest(req);

          await payload.update({
            collection: chatsSlug,
            where: { space: { equals: id } },
            data: { space: null },
            req: toPayloadRequest(req),
            overrideAccess: true,
            trash: true,
            depth: 0,
          });

          if (req.frogbot.config.memory) {
            await req.frogbot.memory.forget({
              scope: 'space',
              chat: { space: id },
              req,
              overrideAccess: true,
            });
          }
        },
      ],
    },
  };
}

/** Adds the Spaces collection (core's, or the app's marked one) and the Space files collection. */
export function resolveSpaceCollections({
  collections,
  chatsSlug,
  userSlug,
}: {
  collections: CollectionConfig[];
  chatsSlug: string;
  userSlug: string;
}): { collections: CollectionConfig[]; spaces: ResolvedSpaces } {
  const slug = spacesSlugFor(collections);
  const existing = collections.find((collection) => collection.space === true);

  const resolved = resolveMarkedCollection({
    collectionLabel: 'Space',
    collections,
    existing,
    marker: 'space',
    feature: 'Spaces',
    defaultCollection: existing ? spaceBase(slug) : defaultSpacesCollection({ slug, userSlug }),
    reservedFields: ['files'],
  }).map((collection) =>
    collection.slug === slug ? withSpaceDelete(collection, { chatsSlug }) : collection,
  );

  if (collections.some((collection) => collection.slug === SPACE_FILES_SLUG)) {
    throw new Error(`[frogbot] Collection slug '${SPACE_FILES_SLUG}' is reserved for Space files.`);
  }

  return {
    collections: [...resolved, spaceFilesCollection({ spacesSlug: slug })],
    spaces: { slug, filesSlug: SPACE_FILES_SLUG },
  };
}
