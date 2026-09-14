import { definePiece } from 'frogbot/pieces';

import { attioActions } from './actions.js';
import { createAttioClient } from './client.js';
import { attioAuth } from './config.js';
import { attioTriggers } from './triggers.js';

export const attioScopes = [] as const;

export const createAttio = definePiece({
  slug: 'attio',
  label: 'Attio',
  admin: {
    description: 'Create and manage Attio CRM records, lists, notes, tasks, and calls',
    group: 'Sales and CRM',
  },
  auth: attioAuth,
  client: createAttioClient,
  actions: attioActions,
  triggers: attioTriggers,
});

export { attioActions } from './actions.js';
