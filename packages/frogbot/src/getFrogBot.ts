// Singleton accessor for the FrogBot instance.
//
// Mirrors Payload's `getPayload()` pattern. Caches the instance on
// `globalThis` so repeated calls return the same object even when the
// module graph is re-evaluated (e.g. Next.js dev HMR).

import type { FrogBotSanitizedConfig } from './config/sanitized.js';
import type { InitOptions } from './frogbot.js';
import { FrogBot } from './frogbot.js';
import type { FrogBotRequest } from './types/request.js';

type FrogBotCache = {
  frogbot: FrogBot | null;
  config: InitOptions['config'] | null;
  promise: Promise<FrogBot> | null;
  promiseConfig: InitOptions['config'] | null;
};

const globalRef = globalThis as { _frogbot?: FrogBotCache };

function getCache(): FrogBotCache {
  return (globalRef._frogbot ??= {
    frogbot: null,
    config: null,
    promise: null,
    promiseConfig: null,
  });
}

/**
 * Get (or create) the singleton FrogBot instance.
 *
 * First call initializes; subsequent calls return the cached instance.
 */
export function getFrogBot(options: InitOptions): Promise<FrogBot> {
  const config = options.config;
  const cached = getCache();
  if (cached.frogbot && (!cached.config || cached.config === config)) {
    return Promise.resolve(cached.frogbot);
  }

  if (cached.promise) {
    if (cached.promiseConfig === config) return cached.promise;
    return cached.promise.then(() => getFrogBot(options));
  }

  if (!cached.promise) {
    const promise = new FrogBot().init(options).then((instance) => {
      cached.frogbot = instance;
      cached.config = config;
      return instance;
    });
    cached.promise = promise;
    cached.promiseConfig = config;
    void promise.then(
      () => {
        if (cached.promise === promise) {
          cached.promise = null;
          cached.promiseConfig = null;
        }
      },
      () => {
        if (cached.promise === promise) cached.promise = null;
        if (cached.promiseConfig === config) cached.promiseConfig = null;
      },
    );
  }

  return cached.promise;
}

/**
 * Returns the cached FrogBot instance synchronously, or null if not yet
 * initialized. Used internally by the beforeOperation hook to stamp
 * `req.frogbot` without async overhead.
 */
export function getCachedFrogBot(): FrogBot | null {
  return getCache().frogbot;
}

export async function createDefaultRequest(): Promise<FrogBotRequest> {
  const frogbot = getCachedFrogBot();
  if (!frogbot) {
    throw new Error(
      '[frogbot] Request-less piece calls require the default FrogBot instance to finish initialization. Pass `req` during `onInit` or when using another runtime.',
    );
  }
  return frogbot.createRequest();
}

export function seedFrogBotCache(frogbot: FrogBot, config?: FrogBotSanitizedConfig): void {
  const cached = getCache();
  cached.frogbot = frogbot;
  cached.config = config ?? cached.config;
}

/**
 * Reset the singleton cache. Used in tests.
 * @internal
 */
export function resetFrogBotCache(): void {
  globalRef._frogbot = { frogbot: null, config: null, promise: null, promiseConfig: null };
}
