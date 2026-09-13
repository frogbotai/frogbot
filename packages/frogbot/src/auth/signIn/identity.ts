import { randomBytes } from 'node:crypto';

import { type PayloadRequest, ValidationError } from 'payload';
import { z } from 'zod';

import { OAuthError } from '../../connections/oauth/index.js';
import type { FrogbotRequest } from '../../types/request.js';
import { withSessionOperation } from '../operation.js';

type SignInIdentity = {
  id: string | number;
  email: string;
  _verified?: boolean;
  deletedAt?: string | null;
};

export async function resolveSignInIdentity({
  req,
  collectionSlug,
  email: accountEmail,
}: {
  req: FrogbotRequest;
  collectionSlug: string;
  email: unknown;
}): Promise<string | number> {
  const parsed = z.string().trim().toLowerCase().pipe(z.email()).safeParse(accountEmail);
  if (!parsed.success) throw new OAuthError('account');
  const email = parsed.data;
  const config = await req.frogbot.config._internal.payloadConfig;
  const collection = config.collections.find(({ slug }) => slug === collectionSlug);
  if (!collection?.auth) throw new OAuthError('configuration');
  return withSessionOperation({
    req,
    collectionSlug,
    fn: async ({ signal }) => {
      const find = async () => {
        signal.throwIfAborted();
        const result = await req.frogbot.db.find<SignInIdentity>({
          collection: collectionSlug,
          limit: 2,
          pagination: false,
          req: req as unknown as PayloadRequest,
          where: {
            and: [
              { email: { equals: email } },
              ...(collection.trash ? [{ deletedAt: { exists: false } }] : []),
            ],
          },
        });
        signal.throwIfAborted();
        if (result.docs.length > 1) throw new OAuthError('account');
        const user = result.docs[0];
        if (
          user &&
          (user.email !== email ||
            user.deletedAt ||
            (collection.auth.verify && user._verified !== true))
        ) {
          throw new OAuthError('account');
        }
        return user;
      };
      const existing = await find();
      if (existing) return existing.id;
      let createdId: string | number | undefined;
      try {
        signal.throwIfAborted();
        const created = await req.frogbot.create({
          collection: collectionSlug,
          data: {
            email,
            password: randomBytes(32).toString('base64url'),
            ...(collection.auth.verify ? { _verified: true } : {}),
          },
          disableVerificationEmail: true,
          overrideAccess: true,
          depth: 0,
          req,
        });
        createdId = created.id;
      } catch (error) {
        if (
          !(error instanceof ValidationError) ||
          !error.data?.errors.length ||
          !error.data.errors.every(
            ({ path, message }) =>
              path === 'email' &&
              [
                req.t('error:valueMustBeUnique'),
                req.t('error:userEmailAlreadyRegistered'),
              ].includes(message),
          )
        ) {
          throw error;
        }
      }
      const user = await find();
      if (!user || (createdId !== undefined && user.id !== createdId)) {
        throw new OAuthError('account');
      }
      return user.id;
    },
  });
}
