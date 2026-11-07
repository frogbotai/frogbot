import { randomBytes } from 'node:crypto';

import type { CollectionConfig, FrogBotConfig, OnInit } from 'frogbot';

/**
 * Appends an `onInit` that makes `email` the user collection's first user while it has none, trashed
 * ones included: the person who shared the app to Dojo then signs in with "Continue with Dojo", and
 * nobody can sign in first and claim the app. If the user can't be made, the app still starts, logs
 * why, and the first sign-in makes the first user as before.
 */
export function withDojoFirstUser(
  config: FrogBotConfig,
  collection: CollectionConfig,
  email: string,
): FrogBotConfig {
  const own = config.onInit === undefined ? [] : [config.onInit].flat();
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
    } catch (error) {
      frogbot.logger.warn(
        `[plugin-dojo] Couldn't add ${email} as the first user of '${collection.slug}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return { ...config, onInit: [...own, seed] };
}
