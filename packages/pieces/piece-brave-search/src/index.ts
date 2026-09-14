import { definePiece } from 'frogbot/pieces';

import { customApiCall } from './actions/customApiCall.js';
import { searchWeb } from './actions/searchWeb.js';
import { createBraveSearchClient } from './client.js';
import { braveSearchAuth } from './config.js';

export const braveSearchActions = ['searchWeb', 'customApiCall'] as const;
export const braveSearchScopes = [] as const;

export const createBraveSearch = definePiece({
  slug: 'brave-search',
  label: 'Brave Search',
  admin: {
    description: 'Search the web with Brave Search',
    group: 'Search',
  },
  auth: braveSearchAuth,
  client: createBraveSearchClient,
  actions: [searchWeb, customApiCall],
});
