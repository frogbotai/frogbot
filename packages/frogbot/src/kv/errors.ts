import { frogbotError } from '../errors/catalog.js';
import type { FrogBotError } from '../errors/FrogBotError.js';

export function kvUnsupported(detail?: string): FrogBotError {
  return frogbotError('kv.unsupported', detail);
}

export function kvLockHeld(key: string): FrogBotError {
  return frogbotError('kv.lock-held', { detail: `KV lock is already held: ${key}`, data: { key } });
}

export function kvLeaseLost(key: string): FrogBotError {
  return frogbotError('kv.lease-lost', { detail: `KV lock lease was lost: ${key}`, data: { key } });
}
