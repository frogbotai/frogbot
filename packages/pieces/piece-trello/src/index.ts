import { definePiece } from 'frogbot/pieces';

import {
  addCardAttachment,
  createCard,
  customApiCall,
  deleteCard,
  deleteCardAttachment,
  getCard,
  getCardAttachment,
  listCardAttachments,
  updateCard,
} from './actions.js';
import { createTrelloClient } from './client.js';
import { trelloAuth } from './config.js';
import { cardCreated, cardDeadline, cardMovedToList } from './triggers.js';

export const trelloActions = [
  'createCard',
  'getCard',
  'updateCard',
  'deleteCard',
  'listCardAttachments',
  'addCardAttachment',
  'getCardAttachment',
  'deleteCardAttachment',
  'customApiCall',
] as const;
export const trelloTriggers = ['cardCreated', 'cardMovedToList', 'cardDeadline'] as const;
export const trelloScopes = [] as const;

export const createTrello = definePiece({
  slug: 'trello',
  label: 'Trello',
  admin: {
    description: 'Manage Trello cards, attachments, and card events',
    group: 'Productivity',
  },
  auth: trelloAuth,
  client: createTrelloClient,
  webhook: {
    async verify() {
      return true;
    },
    async handshake({ req }) {
      return req.method === 'HEAD' ? new Response(null, { status: 200 }) : null;
    },
  },
  actions: [
    createCard,
    getCard,
    updateCard,
    deleteCard,
    listCardAttachments,
    addCardAttachment,
    getCardAttachment,
    deleteCardAttachment,
    customApiCall,
  ],
  triggers: [cardCreated, cardMovedToList, cardDeadline],
});
