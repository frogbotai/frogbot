import type { FrogBotSanitizedConfig } from './config/sanitized.js';
import type { FrogBot } from './frogbot.js';

export const refreshFrogBotConfig = Symbol.for('frogbot.refreshConfig');

type FrogBotInstanceEntry = {
  config?: FrogBotSanitizedConfig;
  frogbot: FrogBot;
};

const globalRef = globalThis as {
  _frogbotInstances?: WeakMap<object, FrogBotInstanceEntry>;
  _frogbotInstancePromises?: WeakMap<object, Promise<FrogBot>>;
};
const instances = (globalRef._frogbotInstances ??= new WeakMap());
const promises = (globalRef._frogbotInstancePromises ??= new WeakMap());

export function registerFrogBotInstance(
  payload: object,
  frogbot: FrogBot,
  config?: FrogBotSanitizedConfig,
): void {
  instances.set(payload, { config, frogbot });
}

export function getFrogBotInstance(payload: object): FrogBot | undefined {
  return instances.get(payload)?.frogbot;
}

export function ensureFrogBotInstance(
  payload: object,
  init: () => Promise<FrogBot>,
  config?: FrogBotSanitizedConfig,
): Promise<FrogBot> {
  const pending = promises.get(payload);
  if (pending) {
    return config ? pending.then(() => ensureFrogBotInstance(payload, init, config)) : pending;
  }

  const registered = instances.get(payload);
  if (registered && (!config || !registered.config || registered.config === config)) {
    return Promise.resolve(registered.frogbot);
  }

  const promise = registered
    ? registered.frogbot[refreshFrogBotConfig](config!).then(() => {
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
