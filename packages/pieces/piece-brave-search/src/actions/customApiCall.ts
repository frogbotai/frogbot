import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Brave Search',
  baseUrl: 'https://api.search.brave.com/res/v1',
  reservedHeaders: ['X-Subscription-Token'],
  headers: { Accept: 'application/json' },
  authorize: ({ client, headers }) => client.authorize(headers),
});
