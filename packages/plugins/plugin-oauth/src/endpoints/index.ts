import type { Endpoint } from 'frogbot';
import type { CredentialEncryption } from 'frogbot/connections';

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
  authCollection: string;
  ownerField: string;
  providers: Map<string, OAuthProvider>;
  encryption: CredentialEncryption;
};

export function createOAuthEndpoints(options: OAuthEndpointsOptions): Endpoint[] {
  return [
    createAuthorizeEndpoint({ ...options, path: options.paths.authorize, callbackPath: options.paths.callback }),
    ...createCallbackEndpoints({ ...options, path: options.paths.callback }),
    ...createLifecycleEndpoints(options),
  ];
}
