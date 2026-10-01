import type { GeneratedTypes } from 'frogbot';
import { expectTypeOf } from 'vitest';

import {
  createFrogBotSDK,
  type FrogBotSDK,
  type WhereFromCollectionSlug,
} from '../../../packages/sdk/src/index.js';
import type { Config, Message, SdkPage, SdkUser } from '../../sdk/frogbot-types.js';

const automatic = createFrogBotSDK({ baseURL: '/api' });
const explicit = createFrogBotSDK<Config>({ baseURL: '/api' });

expectTypeOf(automatic).toEqualTypeOf<FrogBotSDK<GeneratedTypes>>();

export async function automaticTyping() {
  const pages = await automatic.find({ collection: 'sdk-pages' });

  expectTypeOf(pages.docs[0]!).toEqualTypeOf<SdkPage>();
  expectTypeOf(pages.docs[0]!.title).toEqualTypeOf<string>();
  expectTypeOf(pages.totalDocs).toEqualTypeOf<number>();
}

export async function explicitTyping() {
  const pages = await explicit.find({ collection: 'sdk-pages' });

  expectTypeOf(pages.docs[0]!).toEqualTypeOf<SdkPage>();
}

export async function misspelledSlugs() {
  // @ts-expect-error unknown collection slug
  await automatic.find({ collection: 'sdk-pagez' });

  // @ts-expect-error unknown collection slug
  await explicit.find({ collection: 'sdk-pagez' });

  // @ts-expect-error sdk-pages is not an auth collection
  await automatic.login({ collection: 'sdk-pages', data: { email: 'a', password: 'b' } });

  // @ts-expect-error unknown collection slug
  await automatic.search('sdk-pagez', { index: 'content', query: { text: 'frogs' } });
}

export async function selectNarrowsTheResult() {
  const pages = await automatic.find({ collection: 'sdk-pages', select: { title: true } });

  expectTypeOf(pages.docs[0]!).toHaveProperty('title');
  expectTypeOf(pages.docs[0]!).not.toHaveProperty('slug');
}

export async function disableErrors() {
  const page = await automatic.findByID({ collection: 'sdk-pages', disableErrors: true, id: 1 });
  const strict = await automatic.findByID({ collection: 'sdk-pages', id: 1 });

  expectTypeOf(page).toEqualTypeOf<SdkPage | null>();
  expectTypeOf(strict).toEqualTypeOf<SdkPage>();
}

export async function whereFields() {
  await automatic.find({ collection: 'sdk-pages', where: { title: { equals: 'x' } } });
  await automatic.find({ collection: 'sdk-pages', where: { 'group.field': { equals: 'x' } } });
  await automatic.find({ collection: 'sdk-pages', where: { unknown: { exists: true } } });
  await automatic.find({
    collection: 'sdk-pages',
    where: { or: [{ title: { equals: 'x' } }, { slug: { like: 'y' } }] },
  });
}

expectTypeOf<WhereFromCollectionSlug<GeneratedTypes, 'sdk-pages'>>().toHaveProperty('title');
expectTypeOf<WhereFromCollectionSlug<GeneratedTypes, 'sdk-pages'>>().toHaveProperty('group');
expectTypeOf<WhereFromCollectionSlug<GeneratedTypes, 'sdk-pages'>>().not.toBeAny();

export async function authAndVersions() {
  const login = await automatic.login({
    collection: 'sdk-users',
    data: { email: 'a', password: 'b' },
  });
  const versions = await automatic.findVersions({ collection: 'sdk-pages' });
  const restored = await automatic.restoreVersion({ collection: 'sdk-pages', id: 'v1' });

  expectTypeOf(login.user).toEqualTypeOf<SdkUser>();
  expectTypeOf(versions.docs[0]!.version).toEqualTypeOf<SdkPage>();
  expectTypeOf(restored).toEqualTypeOf<SdkPage>();
}

export async function updateAndDelete() {
  const one = await automatic.update({ collection: 'sdk-pages', data: { title: 'x' }, id: 1 });
  const many = await automatic.update({
    collection: 'sdk-pages',
    data: { group: { field: 'x' } },
    where: { title: { equals: 'x' } },
  });
  const removed = await automatic.delete({ collection: 'sdk-pages', id: 1 });

  expectTypeOf(one).toEqualTypeOf<SdkPage>();
  expectTypeOf(many.docs[0]!).toEqualTypeOf<SdkPage>();
  expectTypeOf(removed).toEqualTypeOf<SdkPage>();

  // @ts-expect-error title must be a string
  await automatic.update({ collection: 'sdk-pages', data: { title: 1 }, id: 1 });
}

export async function optionsTheServerReads() {
  await automatic.find({
    collection: 'sdk-pages',
    fallbackLocale: false,
    joins: { children: false },
  });
  await automatic.update({
    autosave: true,
    collection: 'sdk-pages',
    data: { title: 'x' },
    draft: true,
    id: 1,
    publishSpecificLocale: 'fr',
  });

  // @ts-expect-error set each join field to false instead
  await automatic.find({ collection: 'sdk-pages', joins: false });

  // @ts-expect-error the REST update by where doesn't read autosave
  await automatic.update({ autosave: true, collection: 'sdk-pages', data: {}, where: {} });

  // @ts-expect-error the REST update by where doesn't read publishSpecificLocale
  await automatic.update({
    collection: 'sdk-pages',
    data: {},
    publishSpecificLocale: 'fr',
    where: {},
  });

  await automatic.forgotPassword({
    collection: 'sdk-users',
    // @ts-expect-error the REST endpoint ignores disableEmail and expiration
    data: { disableEmail: true, email: 'frog@example.com', expiration: 60 },
  });
}

export async function uploadsAreLimitedToUploadCollections(file: Blob) {
  await automatic.create({ collection: 'sdk-media', data: { alt: 'Frog' }, file });

  // @ts-expect-error sdk-pages is not an upload collection
  await automatic.create({ collection: 'sdk-pages', data: { title: 'x' }, file });
}

export async function searchHits() {
  const result = await automatic.search('sdk-pages', { index: 'content', query: { text: 'x' } });

  expectTypeOf(result.hits[0]!.doc).toEqualTypeOf<SdkPage>();
}

export async function fieldsAreNotAny() {
  const messages = await automatic.find({ collection: 'messages' });
  const message = messages.docs[0]!;

  expectTypeOf(message).toEqualTypeOf<Message>();
  expectTypeOf(message.parts).not.toBeAny();
  expectTypeOf(message.author).not.toBeAny();
  expectTypeOf(message.settlements).not.toBeAny();
}
