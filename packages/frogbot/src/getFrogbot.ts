// Singleton accessor for the Frogbot instance.
//
// Mirrors Payload's `getPayload()` pattern. Caches the instance on
// `globalThis` so repeated calls return the same object even when the
// module graph is re-evaluated (e.g. Next.js dev HMR).

import { Frogbot } from './frogbot.js';
import type { InitOptions } from './frogbot.js';

type FrogbotCache = {
  frogbot: Frogbot | null;
  promise: Promise<Frogbot> | null;
};

const globalRef = globalThis as { _frogbot?: FrogbotCache };

function getCache(): FrogbotCache {
  return (globalRef._frogbot ??= { frogbot: null, promise: null });
}

/**
 * Get (or create) the singleton Frogbot instance.
 *
 * First call initializes; subsequent calls return the cached instance.
 */
export async function getFrogbot(options: InitOptions): Promise<Frogbot> {
  const cached = getCache();
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
  return getCache().frogbot;
}

export function seedFrogbotCache(frogbot: Frogbot): void {
  const cached = getCache();
  cached.frogbot ??= frogbot;
}

/**
 * Reset the singleton cache. Used in tests.
 * @internal
 */
export function resetFrogbotCache(): void {
  globalRef._frogbot = { frogbot: null, promise: null };
}
