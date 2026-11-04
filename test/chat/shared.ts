import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'users';
export const agentSlug = 'support';
export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const questionAgentSlug = 'questioner';
export const lookupCalls: unknown[] = [];
export const approverAgentSlug = 'approver';
export const approvedCalls: Array<{ tool: string; input: unknown }> = [];
export const unavailableTopic = 'unavailable';
export const turnsSlug = 'frogbot-chat-turns';
export const modelPort = testPort(3988);
