import { seoPlugin } from '@frogbotai/plugin-seo';
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@frogbotai/plugin-seo/fields';
import type { FieldsOverride, GenerateImage, SEOPluginOptions } from '@frogbotai/plugin-seo/types';
import type { CollectionConfig, Field, FrogBotRequest, Plugin } from 'frogbot';
import { expectTypeOf } from 'vitest';

type SEOPost = { id: number; postTitle: string };

type SEOPage = { id: number; pageTitle: string };

declare module 'frogbot' {
  interface GeneratedTypes {
    collections: {
      posts: SEOPost;
      pages: SEOPage;
      media: { id: number; filename: string };
    };
  }
}

const fields: CollectionConfig['fields'] = [
  OverviewField({ titlePath: 'meta.title', titleOverrides: { maxLength: 60 } }),
  MetaTitleField({
    hasGenerateFn: true,
    overrides: {
      hooks: {
        beforeChange: [
          ({ req, value }) => {
            expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

            return value;
          },
        ],
      },
      validate: (value, { req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        return value ? true : 'Required';
      },
      access: {
        read: ({ req }) => {
          expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

          return true;
        },
      },
    },
  }),
  MetaDescriptionField({
    overrides: {
      hooks: {
        beforeChange: [
          ({ req, value }) => {
            expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

            return value;
          },
        ],
      },
    },
  }),
  MetaImageField({ relationTo: 'media' }),
  PreviewField({ hasGenerateFn: true, descriptionPath: 'meta.description' }),
  {
    name: 'inlineTitle',
    type: 'text',
    hooks: {
      beforeChange: [
        ({ req, value }) => {
          expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

          return value;
        },
      ],
    },
  },
];

expectTypeOf(fields).toEqualTypeOf<Field[]>();

const plugin = seoPlugin({
  collections: ['posts', 'pages'],
  uploadsCollection: 'media',
  generateTitle: (args) => {
    expectTypeOf(args.req).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(args.req.frogbot).not.toBeAny();

    expectTypeOf(args.req).not.toHaveProperty('payload');

    if (args.collectionSlug === 'posts') {
      expectTypeOf(args.doc).toEqualTypeOf<Partial<SEOPost>>();

      expectTypeOf(args.doc).not.toHaveProperty('pageTitle');

      return args.doc.postTitle ?? '';
    }

    expectTypeOf(args.doc).toEqualTypeOf<Partial<SEOPage>>();

    expectTypeOf(args.doc).not.toHaveProperty('postTitle');

    return args.doc.pageTitle ?? '';
  },
  generateDescription: ({ req, doc }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(doc).toEqualTypeOf<Partial<SEOPost> | Partial<SEOPage>>();

    return Promise.resolve('Description');
  },
  generateURL: ({ req, id, locale }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(id).toEqualTypeOf<number | string | undefined>();
    expectTypeOf(locale).toEqualTypeOf<string | undefined>();

    return '/page';
  },
  generateImage: ({ req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return { id: 1 };
  },
  fields: ({ defaultFields }) => {
    expectTypeOf(defaultFields).toEqualTypeOf<Field[]>();

    return [...defaultFields, MetaTitleField({})];
  },
});

expectTypeOf(plugin).toEqualTypeOf<Plugin>();

const fieldsOverride: FieldsOverride = ({ defaultFields }) => defaultFields;

expectTypeOf(fieldsOverride).returns.toEqualTypeOf<Field[]>();

const options: SEOPluginOptions<'posts'> = {
  collections: ['posts'],
  // @ts-expect-error `globals` is not a FrogBot concept.
  globals: ['site'],
};

seoPlugin(options);

const generateImage: GenerateImage<'posts'> = () => Promise.resolve('image-id');

expectTypeOf(generateImage).returns.toEqualTypeOf<
  { id: number | string } | number | string | Promise<{ id: number | string } | number | string>
>();
