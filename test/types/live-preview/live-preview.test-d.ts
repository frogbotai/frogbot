import type { CollectionConfig, FrogBotConfig, FrogBotRequest, LivePreviewConfig } from 'frogbot';
import { expectTypeOf } from 'vitest';

const rootConfig = {
  admin: {
    livePreview: {
      collections: ['pages'],
      openByDefault: true,
      breakpoints: [{ height: 667, label: 'Mobile', name: 'mobile', width: 375 }],
      url: ({ data, req }) => (req.frogbot ? `/pages/${String(data.slug)}` : null),
    },
  },
} satisfies Pick<FrogBotConfig, 'admin'>;

const collectionConfig = {
  slug: 'pages',
  fields: [],
  admin: {
    livePreview: {
      url: '/pages',
    },
  },
} satisfies CollectionConfig;

const nullURL = { url: null } satisfies LivePreviewConfig;

expectTypeOf(rootConfig).toMatchTypeOf<Pick<FrogBotConfig, 'admin'>>();
expectTypeOf(collectionConfig).toMatchTypeOf<CollectionConfig>();
expectTypeOf(nullURL).toMatchTypeOf<LivePreviewConfig>();
expectTypeOf<
  Parameters<Extract<LivePreviewConfig['url'], (...args: never[]) => unknown>>[0]['req']
>().toEqualTypeOf<FrogBotRequest>();

const invalidRootConfig = {
  admin: {
    livePreview: {
      // @ts-expect-error globals are not part of FrogBot live preview
      globals: ['site'],
    },
  },
} satisfies Pick<FrogBotConfig, 'admin'>;

const invalidRequestConfig = {
  admin: {
    livePreview: {
      url: ({ req }) => {
        // @ts-expect-error Payload is not exposed on FrogBot requests
        return req.payload ? '/pages' : null;
      },
    },
  },
} satisfies Pick<FrogBotConfig, 'admin'>;

expectTypeOf(invalidRootConfig).toBeObject();
expectTypeOf(invalidRequestConfig).toBeObject();
