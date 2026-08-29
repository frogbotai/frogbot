// FrogBot's per-collection auth configuration.
// v0 exposes only Payload's plain options. FrogBot extensions
// (`providers`, `allowedDomains`, `allowSignup`) land in a later stage.

import type { IncomingAuthType, TypeWithID } from 'payload';

import type { CollectionSlug, TypedCollection } from '../types/generated.js';
import type { FrogbotRequest } from '../types/request.js';

export interface AuthConfig {
  depth?: number;
  tokenExpiration?: number;
  verify?:
    | boolean
    | { generateEmailHTML?: (args: { token: string; user: unknown }) => string | Promise<string> };
  maxLoginAttempts?: number;
  lockTime?: number;
  loginWithUsername?:
    boolean | { allowEmailLogin?: boolean; requireEmail?: boolean; requireUsername?: boolean };
  /**
   * Disable the built-in email/password strategy. Only set this when auth is
   * fully replaced by a custom strategy or an OAuth provider.
   */
  disableLocalStrategy?: true | { enableFields?: true; optionalPassword?: true };
  cookies?: {
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    domain?: string;
  };
  useSessions?: boolean;
  strategies?: IncomingAuthType['strategies'];
}

/** Identifier accepted by ID-keyed operations. Mongo collections key by
 *  string; SQL collections key by number; Payload accepts both. */
export type DocID = string | number;

type CommonArgs = {
  context?: Record<string, unknown>;
  depth?: number;
  disableErrors?: boolean;
  fallbackLocale?: string;
  locale?: string;
  overrideAccess?: boolean;
  populate?: Record<string, unknown>;
  req?: FrogbotRequest;
  showHiddenFields?: boolean;
  user?: unknown;
};
// ── Auth operations ───────────────────────────────────────────────────

export type LoginArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { email: string; password: string };
};

export type LoginResult<TSlug extends CollectionSlug> = {
  exp?: number;
  token?: string;
  user?: TypedCollection<TSlug>;
};

export type ForgotPasswordArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { email: string };
  disableEmail?: boolean;
  expiration?: number;
};

export type ResetPasswordArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { password: string; token: string };
};

export type ResetPasswordResult = {
  token?: string;
  user: Record<string, unknown>;
};

export type VerifyEmailArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  token: string;
};

export type UnlockArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { email: string };
};

// ── Auth (headers-based) ──────────────────────────────────────────────

export type AuthArgs = {
  headers: Request['headers'];
  req?: FrogbotRequest;
};

export type AuthResult = {
  permissions: Record<string, unknown>;
  responseHeaders?: Headers;
  user: (Record<string, unknown> & TypeWithID) | null;
};
