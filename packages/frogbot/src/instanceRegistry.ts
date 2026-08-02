import type { Frogbot } from './frogbot.js';
import type { FrogbotSanitizedConfig } from './types/sanitized.js';

export const refreshFrogbotConfig = Symbol();

type FrogbotInstanceEntry = {
  config?: FrogbotSanitizedConfig;
  frogbot: Frogbot;
};

const globalRef = globalThis as {
  _frogbotInstances?: WeakMap<object, FrogbotInstanceEntry>;
  _frogbotInstancePromises?: WeakMap<object, Promise<Frogbot>>;
};
const instances = (globalRef._frogbotInstances ??= new WeakMap());
const promises = (globalRef._frogbotInstancePromises ??= new WeakMap());

export function registerFrogbotInstance(
  payload: object,
  frogbot: Frogbot,
  config?: FrogbotSanitizedConfig,
): void {
  instances.set(payload, { config, frogbot });
}

export function getFrogbotInstance(payload: object): Frogbot | undefined {
  return instances.get(payload)?.frogbot;
}

export function ensureFrogbotInstance(
  payload: object,
  init: () => Promise<Frogbot>,
  config?: FrogbotSanitizedConfig,
): Promise<Frogbot> {
  const pending = promises.get(payload);
  if (pending) {
    return config ? pending.then(() => ensureFrogbotInstance(payload, init, config)) : pending;
  }

  const registered = instances.get(payload);
  if (registered && (!config || !registered.config || registered.config === config)) {
    return Promise.resolve(registered.frogbot);
  }

  const promise = registered
    ? registered.frogbot[refreshFrogbotConfig](config!).then(() => {
        registered.config = config;
        return registered.frogbot;
      })
    : init();
  promises.set(payload, promise);
  const clear = () => {
    if (promises.get(payload) === promise) promises.delete(payload);
  };
  void promise.then(clear, clear);
  return promise;
}
