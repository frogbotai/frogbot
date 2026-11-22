import { randomBytes } from 'node:crypto';

import type { CreateArgs } from '../collections/config/types.js';
import type { CollectionSlug } from '../types/generated.js';

export type FirstUserArgs = {
  /** An auth collection, authored or as Payload sanitized it. */
  collection: { slug: string; auth?: boolean | { verify?: unknown } };
  email: string;
  data?: Record<string, unknown>;
};

export type FirstUser = {
  password: string;
  create: CreateArgs<CollectionSlug>;
};

/**
 * The Local API create call for an auth collection's first user: a random password, already verified when
 * the collection verifies email, no verification email, and access overridden so the collection's hooks,
 * required fields and two-factor rules still apply. `frogbot users create` and Dojo's first-user seed use it.
 */
export function firstUser({ collection, email, data }: FirstUserArgs): FirstUser {
  const password = randomBytes(32).toString('base64url');
  const verify = typeof collection.auth === 'object' && Boolean(collection.auth.verify);

  return {
    password,
    create: {
      collection: collection.slug,
      data: { ...data, email, password, ...(verify && { _verified: true }) },
      disableVerificationEmail: true,
      overrideAccess: true,
      depth: 0,
    },
  };
}
