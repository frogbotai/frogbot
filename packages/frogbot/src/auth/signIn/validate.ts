import type { SanitizedCollectionConfig } from 'payload';

import type { CollectionConfig } from '../../collections/config/types.js';
import { isPieceInstance, pieceInstanceDefinition } from '../../pieces/definePiece.js';
import type { SignInMethod } from '../../pieces/types.js';

export function validateSignIn(collection: CollectionConfig): SignInMethod[] {
  const auth = collection.auth;
  if (!auth || typeof auth !== 'object' || auth.signIn === undefined) return [];
  const fail = (message: string): never => {
    throw new Error(`[frogbot] Collection '${collection.slug}' signIn ${message}`);
  };
  if (!Array.isArray(auth.signIn)) fail('must be an array.');
  if (!auth.signIn.length) return [];
  if (
    auth.disableLocalStrategy &&
    (typeof auth.disableLocalStrategy !== 'object' || !auth.disableLocalStrategy.enableFields)
  ) {
    fail('requires disableLocalStrategy.enableFields to retain identity and session fields.');
  }
  if (
    typeof auth.loginWithUsername === 'object' &&
    auth.loginWithUsername.allowEmailLogin === false
  ) {
    fail('requires unique email identity; allowEmailLogin cannot be false.');
  }
  const email = collection.fields.find((field) => 'name' in field && field.name === 'email');
  if (
    email &&
    (email.type !== 'email' || email.unique === false || email.localized || email.virtual)
  ) {
    fail('requires a unique, stored, non-localized email field.');
  }
  const slugs = new Set<string>();
  for (const method of auth.signIn) {
    if (!isPieceInstance(method)) fail('requires OAuth piece instances.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(method.slug)) fail('method slugs must be URL-safe.');
    if (slugs.has(method.slug)) fail(`has duplicate method slug '${method.slug}'.`);
    slugs.add(method.slug);
    const recipe = pieceInstanceDefinition(method).oauth;
    if (!recipe || typeof recipe.account !== 'function') {
      fail(
        `method '${method.slug}' requires an OAuth recipe with an account function returning email.`,
      );
    }
    if (
      typeof method.oauth?.clientId !== 'string' ||
      !method.oauth.clientId.trim() ||
      typeof method.oauth.clientSecret !== 'string' ||
      !method.oauth.clientSecret.trim()
    ) {
      fail(`method '${method.slug}' requires factory OAuth clientId and clientSecret.`);
    }
  }
  return auth.signIn;
}

export function validateSignInFields(collection: SanitizedCollectionConfig): void {
  const email = collection.flattenedFields.find((field) => field.name === 'email');
  const sessions = collection.flattenedFields.find((field) => field.name === 'sessions');
  if (
    !collection.auth ||
    email?.type !== 'email' ||
    !email.unique ||
    email.localized ||
    email.virtual ||
    (collection.auth.useSessions && sessions?.type !== 'array')
  ) {
    throw new Error(
      `[frogbot] Collection '${collection.slug}' signIn requires unique email identity and compatible session fields.`,
    );
  }
}
