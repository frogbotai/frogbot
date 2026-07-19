import type { Frogbot } from './frogbot.js';

const globalRef = globalThis as { _frogbotInstances?: WeakMap<object, Frogbot> };
const instances = (globalRef._frogbotInstances ??= new WeakMap());

export function registerFrogbotInstance(payload: object, frogbot: Frogbot): void {
  instances.set(payload, frogbot);
}

export function getFrogbotInstance(payload: object): Frogbot | undefined {
  return instances.get(payload);
}
