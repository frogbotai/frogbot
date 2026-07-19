import type { Frogbot } from './frogbot.js';

const instances = new WeakMap<object, Frogbot>();

export function registerFrogbotInstance(payload: object, frogbot: Frogbot): void {
  instances.set(payload, frogbot);
}

export function getFrogbotInstance(payload: object): Frogbot | undefined {
  return instances.get(payload);
}
