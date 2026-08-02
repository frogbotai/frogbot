// Singleton accessor for the Frogbot instance.
//
// Mirrors Payload's `getPayload()` pattern. Caches the instance on
// `globalThis` so repeated calls return the same object even when the
// module graph is re-evaluated (e.g. Next.js dev HMR).

import type { InitOptions } from './frogbot.js';
import { Frogbot } from './frogbot.js';
import type { FrogbotSanitizedConfig } from './types/sanitized.js';

type FrogbotCache = {
  frogbot: Frogbot | null;
  config: InitOptions['config'] | null;
  promise: Promise<Frogbot> | null;
  promiseConfig: InitOptions['config'] | null;
};

const globalRef = globalThis as { _frogbot?: FrogbotCache };

function getCache(): FrogbotCache {
  return (globalRef._frogbot ??= { frogbot: null, config: null, promise: null, promiseConfig: null });
}

/**
 * Get (or create) the singleton Frogbot instance.
 *
 * First call initializes; subsequent calls return the cached instance.
 */
export function getFrogbot(options: InitOptions): Promise<Frogbot> {
  const config = options.config;
  const cached = getCache();
  if (cached.frogbot && (!cached.config || cached.config === config)) return Promise.resolve(cached.frogbot);

  if (cached.promise) {
    if (cached.promiseConfig === config) return cached.promise;
    return cached.promise.then(() => getFrogbot(options));
  }

  if (!cached.promise) {
    const promise = new Frogbot().init(options).then((instance) => {
      cached.frogbot = instance;
      cached.config = config;
      return instance;
    });
    cached.promise = promise;
    cached.promiseConfig = config;
    void promise.then(() => {
      if (cached.promise === promise) {
        cached.promise = null;
        cached.promiseConfig = null;
      }
    }, () => {
      if (cached.promise === promise) cached.promise = null;
      if (cached.promiseConfig === config) cached.promiseConfig = null;
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

export function seedFrogbotCache(frogbot: Frogbot, config?: FrogbotSanitizedConfig): void {
  const cached = getCache();
  cached.frogbot = frogbot;
  cached.config = config ?? cached.config;
}

/**
 * Reset the singleton cache. Used in tests.
 * @internal
 */
export function resetFrogbotCache(): void {
  globalRef._frogbot = { frogbot: null, config: null, promise: null, promiseConfig: null };
}
