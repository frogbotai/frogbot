import { expectTypeOf } from 'vitest';

import { createFrogBotSDK } from '../../../packages/sdk/src/index.js';

const sdk = createFrogBotSDK({ baseURL: '/api' });

export async function untypedResults() {
  const pages = await sdk.find({ collection: 'any-collection' });
  const page = pages.docs[0]!;

  expectTypeOf(page).not.toBeAny();
  expectTypeOf(page).toEqualTypeOf<Record<string, unknown> & { id: string | number }>();
  expectTypeOf(page.title).toEqualTypeOf<unknown>();
  expectTypeOf(page.id).toEqualTypeOf<string | number>();
}

export async function anySlugCompiles() {
  await sdk.findByID({ collection: 'whatever', id: 1 });
  await sdk.create({ collection: 'whatever', data: { title: 'x' } });
  await sdk.login({ collection: 'members', data: { email: 'a', password: 'b' } });
  await sdk.search({ collection: 'articles', index: 'content', query: { text: 'frogs' } });
  await sdk.searchMany({
    collections: [
      { collection: 'articles', index: 'content' },
      { collection: 'faqs', index: 'answers' },
    ],
    query: { text: 'frogs' },
  });
}

export async function untypedSearchHits() {
  const result = await sdk.search({
    collection: 'articles',
    index: 'content',
    query: { text: 'frogs' },
  });

  expectTypeOf(result.hits[0]!.doc).not.toBeAny();
}

export async function untypedSearchManyHits() {
  const { results } = await sdk.searchMany({
    collections: [{ collection: 'articles', index: 'content' }],
    query: { text: 'frogs' },
  });

  expectTypeOf(results[0].collection).toEqualTypeOf<'articles'>();
  expectTypeOf(results[0].hits[0]!.doc).not.toBeAny();
}
