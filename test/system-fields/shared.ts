import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { testPort } from '../__helpers/shared/testPorts.js';

export const databasePath = fileURLToPath(new URL('./system-fields.db', import.meta.url));

export const transactionsDatabasePath = fileURLToPath(
  new URL('./system-fields-transactions.db', import.meta.url),
);

export const importsDir = path.join(tmpdir(), 'frogbot-system-fields-imports');

export const usersSlug = 'users';
export const adminsSlug = 'admins';
export const ticketsSlug = 'tickets';
export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const apiKeysSlug = 'api-keys';
export const importsSlug = 'imports';
export const usageLogsSlug = 'usage-logs';
export const agentSlug = 'ticket-agent';
export const createTicketToolSlug = 'create-ticket';
export const touchTicketTaskSlug = 'touch-ticket';
export const modelPort = testPort(3990);
export const countersSlug = 'frogbot-autonumbers';
