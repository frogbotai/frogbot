import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'users';
export const agentSlug = 'support';
export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const questionAgentSlug = 'questioner';
export const lookupCalls: unknown[] = [];
export const approverAgentSlug = 'approver';
/** An agent on `test/small-window`, the one model whose context window is known. */
export const compactorAgentSlug = 'compactor';
export const approvedCalls: Array<{ tool: string; input: unknown }> = [];
/** The only user name `refund_ticket`'s access rule allows. */
export const refunderName = 'Refunder';
export const unavailableTopic = 'unavailable';
export const notesSlug = 'notes';
/** The only user name the `notes` collection's read rule allows. */
export const memberName = 'Member';
export const readerAgentSlug = 'reader';
export const readerScheduleSlug = 'nightly';
/** One entry per call of the `reader` agent's access rule. */
export const readerAccessCalls: unknown[] = [];
export const readerHandlerSlug = 'nightly-handler';
/** What each `agent.generate` in the `nightly-handler` schedule handler returned: `ok` or a status. */
export const readerHandlerRuns: Array<number | string> = [];
export const turnsSlug = 'frogbot-chat-turns';
export const modelPort = testPort(3988);
