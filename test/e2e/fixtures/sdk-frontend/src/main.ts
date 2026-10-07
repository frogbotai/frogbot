import type { Config, Message, SdkPage } from '@acme/types';
import { createFrogBotSDK } from '@frogbotai/sdk';

type IsAny<T> = 0 extends 1 & T ? true : false;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Expect<T extends true> = T;

export async function findPublishedPage(baseURL: string, title: string) {
  const sdk = createFrogBotSDK({ baseURL });

  const pages = await sdk.find({
    collection: 'sdk-pages',
    depth: 0,
    where: { title: { equals: title } },
  });

  const page = pages.docs[0];

  type Checks = [Expect<Equal<typeof page, SdkPage>>, Expect<Equal<IsAny<typeof page>, false>>];

  const checks: Checks = [true, true];

  return { checks, title: page?.title, totalDocs: pages.totalDocs };
}

export async function findWithExplicitTypes(baseURL: string) {
  const sdk = createFrogBotSDK<Config>({ baseURL });

  const page = await sdk.findByID({ collection: 'sdk-pages', disableErrors: true, id: 1 });

  type Checks = [Expect<Equal<typeof page, SdkPage | null>>];

  const checks: Checks = [true];

  return { checks, title: page?.title };
}

export async function misspelledSlugs(baseURL: string) {
  // @ts-expect-error unknown collection slug
  await createFrogBotSDK({ baseURL }).find({ collection: 'sdk-pagez' });

  // @ts-expect-error unknown collection slug
  await createFrogBotSDK<Config>({ baseURL }).find({ collection: 'sdk-pagez' });
}

export type ChatFieldChecks = [
  Expect<Equal<IsAny<Message['parts']>, false>>,
  Expect<Equal<IsAny<Message['author']>, false>>,
  Expect<Equal<IsAny<Message['settlements']>, false>>,
];
