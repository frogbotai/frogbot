import { seoPlugin as payloadSeoPlugin } from '@payloadcms/plugin-seo';
import type {
  GenerateTitle as PayloadGenerateTitle,
  SEOPluginConfig as PayloadSEOPluginConfig,
} from '@payloadcms/plugin-seo/types';
import type { CollectionConfig, CollectionSlug, Field, Plugin } from 'frogbot';
import {
  attachRegisteredFrogBot,
  fromPayloadConfig,
  fromPayloadFields,
  toPayloadConfig,
  toPayloadFields,
} from 'frogbot/internal';

import type { GenerateArgs, SEOPluginOptions } from './types.js';

export type {
  FieldsOverride,
  GenerateArgs,
  GenerateDescription,
  GenerateImage,
  GenerateTitle,
  GenerateURL,
  SEOPluginOptions,
} from './types.js';

const seoComponentPaths = new Set([
  '@payloadcms/plugin-seo/client#OverviewComponent',
  '@payloadcms/plugin-seo/client#MetaTitleComponent',
  '@payloadcms/plugin-seo/client#MetaDescriptionComponent',
  '@payloadcms/plugin-seo/client#MetaImageComponent',
  '@payloadcms/plugin-seo/client#PreviewComponent',
]);

function hasSeoField(fields: Field[]): boolean {
  return fields.some((field) => {
    const component = field.admin?.components?.Field;
    const path = typeof component === 'string' ? component : component && component.path;

    if (path && seoComponentPaths.has(path)) {
      return true;
    }

    if (field.type === 'tabs') {
      return field.tabs.some((tab) => hasSeoField(tab.fields));
    }

    if (field.type === 'group' || field.type === 'row' || field.type === 'collapsible') {
      return hasSeoField(field.fields);
    }

    return false;
  });
}

type PayloadGenerateArgs = Parameters<PayloadGenerateTitle>[0];

function toPayloadSEOConfig<S extends CollectionSlug>(
  options: SEOPluginOptions<S>,
  slugs: readonly string[],
): PayloadSEOPluginConfig {
  const { fields, generateDescription, generateImage, generateTitle, generateURL, ...rest } =
    options;

  const isSlug = (slug: string | undefined): slug is S =>
    slug !== undefined && slugs.includes(slug);

  const toGenerateArgs = (args: PayloadGenerateArgs): GenerateArgs<S> => {
    const { collectionSlug } = args;

    if (!isSlug(collectionSlug)) {
      throw new Error(
        `[@frogbotai/plugin-seo] Cannot generate SEO metadata for "${collectionSlug ?? args.globalSlug}": it is not one of the plugin's collections (${slugs.join(', ')}).`,
      );
    }

    return { ...args, collectionSlug, req: attachRegisteredFrogBot(args.req) };
  };

  return {
    ...rest,
    ...(fields && {
      fields: ({ defaultFields }) =>
        toPayloadFields(fields({ defaultFields: fromPayloadFields(defaultFields) })),
    }),
    ...(generateDescription && {
      generateDescription: (args) => generateDescription(toGenerateArgs(args)),
    }),
    ...(generateImage && { generateImage: (args) => generateImage(toGenerateArgs(args)) }),
    ...(generateTitle && { generateTitle: (args) => generateTitle(toGenerateArgs(args)) }),
    ...(generateURL && { generateURL: (args) => generateURL(toGenerateArgs(args)) }),
  };
}

export function seoPlugin<const S extends CollectionSlug>(options: SEOPluginOptions<S>): Plugin {
  return (config) => {
    const handPlacedCollections = new Map<string, CollectionConfig>();

    for (const collection of config.collections ?? []) {
      if (options.collections?.includes(collection.slug as S) && hasSeoField(collection.fields)) {
        handPlacedCollections.set(collection.slug, collection);
      }
    }

    const slugs =
      options.collections ?? (config.collections ?? []).map((collection) => collection.slug);

    const result = fromPayloadConfig(
      payloadSeoPlugin(toPayloadSEOConfig(options, slugs))(toPayloadConfig(config)),
    );

    return {
      ...result,
      collections: result.collections?.map(
        (collection) => handPlacedCollections.get(collection.slug) ?? collection,
      ),
    };
  };
}
