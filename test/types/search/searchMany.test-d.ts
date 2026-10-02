import type {
  FrogBotInstance,
  SearchManyCollection,
  SearchManyCollectionResult,
  Where,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { SdkMedia, SdkPage } from '../../sdk/frogbot-types.js';

declare const frogbot: FrogBotInstance;

const query = { text: 'frogs' };

export async function resultsFollowTheRequestOrder() {
  const { results } = await frogbot.searchMany({
    collections: [
      { collection: 'sdk-pages', index: 'content', where: { title: { in: ['Frogs', 'Toads'] } } },
      { collection: 'sdk-media', index: 'captions', select: { alt: true }, depth: 1 },
    ],
    query,
    limit: 5,
    overrideAccess: true,
  });

  expectTypeOf(results).toEqualTypeOf<
    readonly [SearchManyCollectionResult<'sdk-pages'>, SearchManyCollectionResult<'sdk-media'>]
  >();

  const [pages, media] = results;

  expectTypeOf(pages.collection).toEqualTypeOf<'sdk-pages'>();
  expectTypeOf(pages.hits[0].doc).toEqualTypeOf<SdkPage>();
  expectTypeOf(media.collection).toEqualTypeOf<'sdk-media'>();
  expectTypeOf(media.hits[0].doc).toEqualTypeOf<SdkMedia>();
}

export async function collectionNarrowsTheDocument() {
  const { results } = await frogbot.searchMany({
    collections: [
      { collection: 'sdk-pages', index: 'content' },
      { collection: 'sdk-media', index: 'captions' },
    ],
    query,
    overrideAccess: true,
  });

  for (const group of results) {
    if (group.collection === 'sdk-media') {
      expectTypeOf(group.hits[0].doc).toEqualTypeOf<SdkMedia>();
    }
  }
}

export async function documentsKeepTheirCollectionType() {
  const { results } = await frogbot.searchMany({
    collections: [{ collection: 'sdk-media', index: 'captions' }],
    query,
    overrideAccess: true,
  });

  // @ts-expect-error media hits hold media documents
  const page: SdkPage = results[0].hits[0].doc;

  return page;
}

export async function invalidOptions() {
  await frogbot.searchMany({
    // @ts-expect-error unknown collection slug
    collections: [{ collection: 'sdk-pagez', index: 'content' }],
    query,
    overrideAccess: true,
  });

  await frogbot.searchMany({
    // @ts-expect-error the query is shared by every collection
    collections: [{ collection: 'sdk-pages', index: 'content', query }],
    query,
    overrideAccess: true,
  });

  await frogbot.searchMany({
    // @ts-expect-error searchMany names its collections in entries
    collection: 'sdk-pages',
    collections: [{ collection: 'sdk-pages', index: 'content' }],
    query,
    overrideAccess: true,
  });
}

expectTypeOf<SearchManyCollection<'sdk-pages'>['where']>().toEqualTypeOf<Where | undefined>();
