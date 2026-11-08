import { randomBytes } from 'node:crypto';

import type { CollectionConfig, FrogBotConfig, OnInit } from 'frogbot';

type ValidationErrors = { data?: { errors?: { path?: string; message?: string }[] } };

function reason(error: unknown): string {
  const fields = (error as ValidationErrors | null)?.data?.errors
    ?.map(({ path, message }) => (path ? `${path}: ${message ?? 'invalid'}` : message))
    .filter(Boolean);

  if (fields?.length) return fields.join(', ');

  return error instanceof Error ? error.message : String(error);
}

/**
 * Appends an `onInit` that makes `email`, the person who shared the app to Dojo, the first user of
 * `collection` when it has no documents, trashed ones included. Data the app brought is never
 * touched, and a create that fails is a warning: the app still starts, and the first sign-in makes
 * the first user as on any empty app (frogbot-237).
 */
export function withDojoFirstUser(
  config: FrogBotConfig,
  collection: CollectionConfig,
  email: string,
): FrogBotConfig {
  const verify = typeof collection.auth === 'object' && Boolean(collection.auth.verify);

  const seed: OnInit = async (frogbot) => {
    try {
      const { docs } = await frogbot.db.find({
        collection: collection.slug,
        limit: 1,
        pagination: false,
      });

      if (docs.length > 0) return;

      await frogbot.create({
        collection: collection.slug,
        data: {
          email,
          password: randomBytes(32).toString('base64url'),
          ...(verify ? { _verified: true } : {}),
        },
        disableVerificationEmail: true,
        overrideAccess: true,
        depth: 0,
      });

      frogbot.logger.info(`[plugin-dojo] Added ${email} as the first user.`);
    } catch (error) {
      frogbot.logger.warn(
        `[plugin-dojo] Couldn't add ${email} as the first user: ${reason(error).replace(/\.$/, '')}.`,
      );
    }
  };

  const own = config.onInit === undefined ? [] : [config.onInit].flat();

  return { ...config, onInit: [...own, seed] };
}
