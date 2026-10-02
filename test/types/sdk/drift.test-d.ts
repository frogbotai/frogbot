import type {
  AgentManifest as CoreAgentManifest,
  AgentManifestEntry as CoreAgentManifestEntry,
  GeneratedTypes,
  PaginatedDocs,
  SearchManyResult as CoreSearchManyResult,
  SearchResult as CoreSearchResult,
  TypeWithVersion,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import type {
  AgentManifest,
  AgentManifestEntry,
  FrogBotSDK,
  SearchManyResult,
  SearchResult,
} from '../../../packages/sdk/src/index.js';
import type { SdkPage } from '../../sdk/frogbot-types.js';

type SDK = FrogBotSDK<GeneratedTypes>;

expectTypeOf<SearchResult<GeneratedTypes, 'sdk-pages'>>().toEqualTypeOf<
  CoreSearchResult<'sdk-pages'>
>();

expectTypeOf<SearchManyResult<GeneratedTypes, readonly ['sdk-pages', 'sdk-media']>>().toEqualTypeOf<
  CoreSearchManyResult<readonly ['sdk-pages', 'sdk-media']>
>();

export async function wireTypesMatchCore(sdk: SDK) {
  const pages = await sdk.find({ collection: 'sdk-pages' });
  const versions = await sdk.findVersions({ collection: 'sdk-pages' });
  const hits = await sdk.search({
    collection: 'sdk-pages',
    index: 'content',
    query: { text: 'frogs' },
  });
  const many = await sdk.searchMany({
    collections: [
      { collection: 'sdk-pages', index: 'content' },
      { collection: 'sdk-media', index: 'captions' },
    ],
    query: { text: 'frogs' },
  });

  expectTypeOf(pages).toEqualTypeOf<PaginatedDocs<SdkPage>>();
  expectTypeOf(versions).toEqualTypeOf<PaginatedDocs<TypeWithVersion<SdkPage>>>();
  expectTypeOf(hits).toEqualTypeOf<CoreSearchResult<'sdk-pages'>>();
  expectTypeOf(many).toEqualTypeOf<CoreSearchManyResult<readonly ['sdk-pages', 'sdk-media']>>();
}

expectTypeOf<AgentManifest>().toEqualTypeOf<CoreAgentManifest>();
expectTypeOf<AgentManifestEntry>().toEqualTypeOf<CoreAgentManifestEntry>();
