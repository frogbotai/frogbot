// Test-only entry point. Exposes the internal boot surface so integration
// tests can spin a real frogbot instance without going through the CLI bin.
//
// This module is NOT part of the public API. Production code must never
// import from `frogbot/test`.

export type { BranchChatProps, BranchChatResult } from '../chat/branchChat.js';
export { branchChat } from '../chat/branchChat.js';
export { resolveChatContext } from '../chat/chatContext.js';
export { persistAssistantMessage } from '../chat/messagePersistence.js';
export type { FrogBotSanitizedConfig } from '../config/sanitized.js';
export type { InitOptions } from '../frogbot.js';
export type { FrogBot as FrogBotInstance } from '../frogbot.js';
export { FrogBot } from '../frogbot.js';
export { getFrogBot, resetFrogBotCache } from '../getFrogBot.js';
