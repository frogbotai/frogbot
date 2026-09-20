import type {
  FeatureProviderProviderServer,
  FeatureProviderServer,
  ResolvedServerFeatureMap,
  ServerEditorConfig,
  ServerFeatureProviderMap,
} from '@payloadcms/richtext-lexical';
import { createServerFeature as upstreamCreateServerFeature } from '@payloadcms/richtext-lexical';
import type { SanitizedConfig } from 'payload';

import type { ServerFeature } from '../features/typesServer.js';

export type CreateServerFeatureArgs<UnSanitizedProps, SanitizedProps, ClientProps> = Pick<
  FeatureProviderServer<UnSanitizedProps, SanitizedProps, ClientProps>,
  'dependencies' | 'dependenciesPriority' | 'dependenciesSoft' | 'key'
> & {
  feature:
    | ((props: {
        config: SanitizedConfig;
        featureProviderMap: ServerFeatureProviderMap;
        isRoot?: boolean;
        parentIsLocalized: boolean;
        props: UnSanitizedProps;
        resolvedFeatures: ResolvedServerFeatureMap;
        unSanitizedEditorConfig: ServerEditorConfig;
      }) =>
        | Promise<ServerFeature<SanitizedProps, ClientProps>>
        | ServerFeature<SanitizedProps, ClientProps>)
    | Omit<ServerFeature<SanitizedProps, ClientProps>, 'sanitizedServerFeatureProps'>;
};

export const createServerFeature = upstreamCreateServerFeature as unknown as <
  UnSanitizedProps = undefined,
  SanitizedProps = UnSanitizedProps,
  ClientProps = undefined,
>(
  args: CreateServerFeatureArgs<UnSanitizedProps, SanitizedProps, ClientProps>,
) => FeatureProviderProviderServer<UnSanitizedProps, SanitizedProps, ClientProps>;
