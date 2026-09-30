import type {
  GenerateImage as PayloadGenerateImage,
  GenerateTitle as PayloadGenerateTitle,
} from '@payloadcms/plugin-seo/types';
import type { CollectionSlug, Field, FrogBotRequest, TypedCollection } from 'frogbot';

type SEOGenerateContext = Pick<
  Parameters<PayloadGenerateTitle>[0],
  | 'hasPublishedDoc'
  | 'hasPublishPermission'
  | 'hasSavePermission'
  | 'id'
  | 'locale'
  | 'preferencesKey'
  | 'title'
  | 'versionCount'
>;

export type GenerateArgs<S extends CollectionSlug = CollectionSlug> = {
  [K in S]: SEOGenerateContext & {
    collectionSlug: K;
    doc: Partial<TypedCollection<K>>;
    req: FrogBotRequest;
  };
}[S];

export type GenerateTitle<S extends CollectionSlug = CollectionSlug> = (
  args: GenerateArgs<S>,
) => Promise<string> | string;

export type GenerateDescription<S extends CollectionSlug = CollectionSlug> = GenerateTitle<S>;

export type GenerateURL<S extends CollectionSlug = CollectionSlug> = GenerateTitle<S>;

export type GenerateImage<S extends CollectionSlug = CollectionSlug> = (
  args: GenerateArgs<S>,
) => ReturnType<PayloadGenerateImage>;

export type FieldsOverride = (args: { defaultFields: Field[] }) => Field[];

export type SEOPluginOptions<S extends CollectionSlug = CollectionSlug> = {
  collections?: S[];
  fields?: FieldsOverride;
  generateDescription?: GenerateDescription<S>;
  generateImage?: GenerateImage<S>;
  generateTitle?: GenerateTitle<S>;
  generateURL?: GenerateURL<S>;
  interfaceName?: string;
  tabbedUI?: boolean;
  uploadsCollection?: CollectionSlug;
};
