import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'eval-users';
export const agentSlug = 'support';
export const modelPort = testPort(3997);

export const agentModel = 'test/agent';
export const otherModel = 'test/other';
export const offListModel = 'test/judge';

export const deniedEmail = 'denied@evals.test';

/** Case inputs whose next result write fails, once each. */
export const failNextWrite = new Set<string>();
