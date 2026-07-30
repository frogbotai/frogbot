import type { CollectionConfig, FrogbotRequest } from 'frogbot';

import type { OAuthEncryption } from './server/crypto.js';

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  tokenType?: string;
  idToken?: string;
  metadata?: Record<string, unknown>;
};

export type OAuthAccount = {
  id: string;
  email?: string;
  name?: string;
  metadata?: Record<string, unknown>;
};

export type OAuthAuthorizeContext = {
  callbackUrl: string;
  codeChallenge: string;
  state: string;
};

export type OAuthExchangeContext = {
  callbackUrl: string;
  code: string;
  codeVerifier: string;
  req: FrogbotRequest;
};

export type OAuthAccountContext = {
  req: FrogbotRequest;
  tokens: OAuthTokenSet;
};

export type OAuthRefreshContext = {
  req: FrogbotRequest;
  tokens: OAuthTokenSet;
};

export type OAuthRevokeContext = {
  req: FrogbotRequest;
  tokens: OAuthTokenSet;
};

export interface OAuthProvider {
  id: string;
  service: string;
  services?: string[];
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  authorize(context: OAuthAuthorizeContext): Promise<URL> | URL;
  exchange(context: OAuthExchangeContext): Promise<OAuthTokenSet>;
  getAccount(context: OAuthAccountContext): Promise<OAuthAccount>;
  refresh?(context: OAuthRefreshContext): Promise<OAuthTokenSet>;
  revoke?(context: OAuthRevokeContext): Promise<void>;
}

export type OAuthPluginOptions = {
  providers?: OAuthProvider[];
  authCollection?: string;
  statesSlug?: string;
  statesCollection?: Partial<CollectionConfig>;
  ownerField?: {
    name: string;
    relationTo: string;
  };
  baseUrl?: string;
  paths?: {
    authorize?: string;
    callback?: string;
    refresh?: string;
    revoke?: string;
  };
  allowedReturnOrigins?: string[];
  encryption?: OAuthEncryption;
};
