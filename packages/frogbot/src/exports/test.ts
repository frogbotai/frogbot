// Test-only entry point. Exposes the internal boot surface so integration
// tests can spin a real frogbot instance without going through the CLI bin.
//
// This module is NOT part of the public API. Production code must never
// import from `frogbot/test`.

export { Frogbot } from '../frogbot.js';
export type { InitOptions } from '../frogbot.js';
export type { Frogbot as FrogbotInstance } from '../frogbot.js';
export { getFrogbot, resetFrogbotCache } from '../getFrogbot.js';
export { resolveThreadContext } from '../chat/threadContext.js';
export { persistAssistantMessage } from '../chat/messagePersistence.js';
export type { FrogbotSanitizedConfig } from '../types/sanitized.js';
