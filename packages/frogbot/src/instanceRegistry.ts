import type { Frogbot } from './frogbot.js';

const globalRef = globalThis as {
  _frogbotInstances?: WeakMap<object, Frogbot>;
  _frogbotInstancePromises?: WeakMap<object, Promise<Frogbot>>;
};
const instances = (globalRef._frogbotInstances ??= new WeakMap());
const promises = (globalRef._frogbotInstancePromises ??= new WeakMap());

export function registerFrogbotInstance(payload: object, frogbot: Frogbot): void {
  instances.set(payload, frogbot);
}

export function getFrogbotInstance(payload: object): Frogbot | undefined {
  return instances.get(payload);
}

export function ensureFrogbotInstance(
  payload: object,
  init: () => Promise<Frogbot>,
): Promise<Frogbot> {
  const registered = getFrogbotInstance(payload);
  if (registered) return Promise.resolve(registered);

  const pending = promises.get(payload);
  if (pending) return pending;

  const promise = init();
  promises.set(payload, promise);
  void promise.catch(() => {
    if (promises.get(payload) === promise) promises.delete(payload);
  });
  return promise;
}
