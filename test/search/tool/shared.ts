import { fileURLToPath } from 'node:url';

import { testPort } from '../../__helpers/shared/testPorts.js';

export const databasePath = fileURLToPath(new URL('./search-tool.db', import.meta.url));
export const embedderModel = 'embedder';
export const dimensions = 3;
export const modelPort = testPort(3996);
export const agentSlug = 'researcher';
