import {
  UploadFeature as upstreamUploadFeature,
  type UploadFeatureProps as UpstreamUploadFeatureProps,
} from '@payloadcms/richtext-lexical';
import type { Field } from 'frogbot';
import { wrapFieldRequestFunctions } from 'frogbot/internal';

import type { DistributiveOmit } from '../../typeUtilities.js';

type UpstreamUploadCollections = NonNullable<UpstreamUploadFeatureProps['collections']>;

type RuntimeFields = UpstreamUploadCollections[string]['fields'];

export type UploadFeatureProps = DistributiveOmit<UpstreamUploadFeatureProps, 'collections'> & {
  collections?: { [collection: string]: { fields: Field[] } };
};

function adaptCollections(
  collections: UploadFeatureProps['collections'],
): UpstreamUploadCollections | undefined {
  if (!collections) return collections;

  return Object.fromEntries(
    Object.entries(collections).map(([slug, collection]) => [
      slug,
      { ...collection, fields: wrapFieldRequestFunctions(collection.fields) as RuntimeFields },
    ]),
  );
}

export const UploadFeature = (
  props?: UploadFeatureProps,
): ReturnType<typeof upstreamUploadFeature> =>
  upstreamUploadFeature({
    ...props,
    collections: adaptCollections(props?.collections),
  } as UpstreamUploadFeatureProps);
