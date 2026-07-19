// Singleton accessor for the Frogbot instance.
//
// Mirrors Payload's `getPayload()` pattern. Caches the instance at
// module level so repeated calls return the same object.

import { Frogbot } from './frogbot.js';
import type { InitOptions } from './frogbot.js';

let cached: {
  frogbot: Frogbot | null;
  promise: Promise<Frogbot> | null;
} = {
  frogbot: null,
  promise: null,
};

/**
 * Get (or create) the singleton Frogbot instance.
 *
 * First call initializes; subsequent calls return the cached instance.
 */
export async function getFrogbot(options: InitOptions): Promise<Frogbot> {
  if (cached.frogbot) return cached.frogbot;

  if (!cached.promise) {
    cached.promise = new Frogbot().init(options).then((instance) => {
      cached.frogbot = instance;
      return instance;
    });
  }

  return cached.promise;
}

/**
 * Returns the cached Frogbot instance synchronously, or null if not yet
 * initialized. Used internally by the beforeOperation hook to stamp
 * `req.frogbot` without async overhead.
 */
export function getCachedFrogbot(): Frogbot | null {
  return cached.frogbot;
}

/**
 * Reset the singleton cache. Used in tests.
 * @internal
 */
export function resetFrogbotCache(): void {
  cached = { frogbot: null, promise: null };
}
