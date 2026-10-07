import type {
  FeatureProviderProviderServer,
  ServerFeature as PayloadServerFeature,
} from '@payloadcms/richtext-lexical';
import type { createServerFeature as upstreamCreateServerFeature } from '@payloadcms/richtext-lexical';

import type { ServerFeature } from '../features/typesServer.js';
import type { CreateServerFeatureArgs } from './createServerFeature.js';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Check<T extends true> = T;

type PayloadCreateServerFeatureArgs<UnSanitizedProps, SanitizedProps, ClientProps> = Parameters<
  typeof upstreamCreateServerFeature<UnSanitizedProps, SanitizedProps, ClientProps>
>[0];

type NodeRegistration<T extends { nodes?: unknown[] }> = NonNullable<T['nodes']>[number];

export type _ServerFeatureChecks = [
  Check<
    Mutual<
      Omit<CreateServerFeatureArgs<unknown, unknown, unknown>, 'feature'>,
      Omit<PayloadCreateServerFeatureArgs<unknown, unknown, unknown>, 'feature'>
    >
  >,
  Check<
    Mutual<
      Omit<ServerFeature<unknown, unknown>, 'nodes'>,
      Omit<PayloadServerFeature<unknown, unknown>, 'nodes'>
    >
  >,
  Check<
    Mutual<
      keyof NodeRegistration<ServerFeature<unknown, unknown>>,
      keyof NodeRegistration<PayloadServerFeature<unknown, unknown>>
    >
  >,
  Check<
    Mutual<
      ReturnType<typeof upstreamCreateServerFeature<unknown, unknown, unknown>>,
      FeatureProviderProviderServer<unknown, unknown, unknown>
    >
  >,
];

export function toPayloadServerFeatureArgs<UnSanitizedProps, SanitizedProps, ClientProps>(
  args: CreateServerFeatureArgs<UnSanitizedProps, SanitizedProps, ClientProps>,
): PayloadCreateServerFeatureArgs<UnSanitizedProps, SanitizedProps, ClientProps> {
  return args as unknown as PayloadCreateServerFeatureArgs<
    UnSanitizedProps,
    SanitizedProps,
    ClientProps
  >;
}
