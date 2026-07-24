import type { Endpoint } from 'frogbot';

import type { OAuthEncryption } from '../server/crypto.js';
import type { OAuthProvider } from '../types.js';
import { createAuthorizeEndpoint } from './authorize.js';
import { createCallbackEndpoints } from './callback.js';
import { createLifecycleEndpoints } from './lifecycle.js';

type OAuthEndpointsOptions = {
  baseUrl: string;
  allowedReturnOrigins: string[];
  paths: { authorize: string; callback: string; refresh: string; revoke: string };
  statesSlug: string;
  connectionsSlug: string;
  ownerField: string;
  providers: Map<string, OAuthProvider>;
  encryption: OAuthEncryption;
};

export function createOAuthEndpoints(options: OAuthEndpointsOptions): Endpoint[] {
  return [
    createAuthorizeEndpoint({ ...options, path: options.paths.authorize, callbackPath: options.paths.callback }),
    ...createCallbackEndpoints({ ...options, path: options.paths.callback }),
    ...createLifecycleEndpoints(options),
  ];
}
