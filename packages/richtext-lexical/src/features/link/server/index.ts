import {
  LinkFeature as upstreamLinkFeature,
  type LinkFeatureServerProps as UpstreamLinkFeatureServerProps,
} from '@payloadcms/richtext-lexical';
import type { Field } from 'frogbot';
import { wrapFieldRequestFunctions } from 'frogbot/internal';
import type { SanitizedConfig } from 'payload';

import type { DistributiveOmit } from '../../typeUtilities.js';

type RuntimeFields = Extract<UpstreamLinkFeatureServerProps['fields'], unknown[]>;

export type LinkFeatureServerProps = DistributiveOmit<UpstreamLinkFeatureServerProps, 'fields'> & {
  fields?: ((args: { config: SanitizedConfig; defaultFields: Field[] }) => Field[]) | Field[];
};

function adaptFields(
  fields: LinkFeatureServerProps['fields'],
): UpstreamLinkFeatureServerProps['fields'] {
  if (typeof fields === 'function') {
    return ({ config, defaultFields }) =>
      wrapFieldRequestFunctions(
        fields({ config, defaultFields: defaultFields as Field[] }),
      ) as RuntimeFields;
  }

  return fields && (wrapFieldRequestFunctions(fields) as RuntimeFields);
}

export const LinkFeature = (
  props?: LinkFeatureServerProps,
): ReturnType<typeof upstreamLinkFeature> =>
  upstreamLinkFeature({
    ...props,
    fields: adaptFields(props?.fields),
  } as UpstreamLinkFeatureServerProps);
