import { definePiece } from 'frogbot/pieces';

import { mondayActions } from './actions.js';
import { createMondayClient } from './client.js';
import { mondayAuth } from './config.js';
import { mondayTriggers } from './triggers.js';

export const mondayActionNames = mondayActions.map((action) => action.slug);
export const mondayTriggerNames = mondayTriggers.map((trigger) => trigger.slug);

export const createMonday = definePiece({
  slug: 'monday',
  label: 'monday.com',
  admin: {
    description: 'Manage monday.com boards, items, columns, updates, files, and webhooks',
    group: 'Productivity',
  },
  auth: mondayAuth,
  client: createMondayClient,
  webhook: {
    verify() {
      return Promise.resolve(true);
    },
    handshake({ req }) {
      const challenge = (req.data as { challenge?: unknown } | undefined)?.challenge;

      return Promise.resolve(typeof challenge === 'string' ? Response.json({ challenge }) : null);
    },
  },
  actions: mondayActions,
  triggers: mondayTriggers,
});
