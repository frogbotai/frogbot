import { frogbotError } from '../errors/catalog.js';
import type { FrogBotError } from '../errors/FrogBotError.js';

export function kvUnsupported(detail?: string): FrogBotError {
  return frogbotError('kv.unsupported', detail);
}

export function kvLockHeld(): FrogBotError {
  return frogbotError('kv.lock-held');
}

export function kvLeaseLost(): FrogBotError {
  return frogbotError('kv.lease-lost');
}
