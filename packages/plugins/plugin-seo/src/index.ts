import { seoPlugin as payloadSeoPlugin } from '@payloadcms/plugin-seo';
import type { CollectionConfig, CollectionSlug, Field, Plugin } from 'frogbot';

import type { SEOPluginOptions } from './types.js';

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

export function seoPlugin<const S extends CollectionSlug>(options: SEOPluginOptions<S>): Plugin {
  return (config) => {
    const handPlacedCollections = new Map<string, CollectionConfig>();

    for (const collection of config.collections ?? []) {
      if (options.collections?.includes(collection.slug as S) && hasSeoField(collection.fields)) {
        handPlacedCollections.set(collection.slug, collection);
      }
    }

    const result = payloadSeoPlugin(options as never)(config as never) as unknown as typeof config;

    return {
      ...result,
      collections: result.collections?.map(
        (collection) => handPlacedCollections.get(collection.slug) ?? collection,
      ),
    };
  };
}
