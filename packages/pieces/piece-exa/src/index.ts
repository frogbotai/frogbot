import { definePiece } from 'frogbot/pieces';

import { findSimilarPages, generateAnswer, getContents, search } from './actions.js';
import { createExaClient } from './client.js';
import { exaAuth } from './config.js';

export const exaActions = ['search', 'getContents', 'generateAnswer', 'findSimilarPages'] as const;

export const createExa = definePiece({
  slug: 'exa',
  label: 'Exa',
  admin: {
    description: 'Search the web, extract page content, and generate grounded answers',
    group: 'Artificial Intelligence',
  },
  auth: exaAuth,
  client: createExaClient,
  actions: [search, getContents, generateAnswer, findSimilarPages],
});
