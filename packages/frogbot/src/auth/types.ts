import type { AuthStrategyFunctionArgs as PayloadAuthStrategyFunctionArgs } from 'payload';

import type { FrogBot } from '../frogbot.js';
import type { SignInMethod } from '../pieces/types.js';
import type { CollectionSlug, TypedCollection, TypedUser } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

export interface AuthConfig {
  signIn?: SignInMethod[];
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
  strategies?: AuthStrategy[];
}

export type AuthStrategyFunctionArgs = Omit<PayloadAuthStrategyFunctionArgs, 'payload' | 'req'> & {
  frogbot: FrogBot;
  req?: FrogBotRequest;
};

export type AuthStrategyResult = {
  responseHeaders?: Headers;
  user: (TypedUser & { _strategy?: string; collection?: string }) | null;
};

export type AuthStrategyFunction = (
  args: AuthStrategyFunctionArgs,
) => AuthStrategyResult | Promise<AuthStrategyResult>;

export type AuthStrategy = {
  authenticate: AuthStrategyFunction;
  name: string;
};

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
  req?: FrogBotRequest;
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
  req?: FrogBotRequest;
};

export type AuthResult = {
  permissions: Record<string, unknown>;
  responseHeaders?: Headers;
  user: TypedUser | null;
};
