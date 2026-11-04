import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Zendesk',
  description:
    'Call any Zendesk Support or Help Center API endpoint with the connected credential, with a path such as /tickets/1 under /api/v2. Returns { status, headers, body }.',
  baseUrl: (client) => `${client.origin}/api/v2`,
  authorize: ({ client, headers }) => client.authorize(headers),
});
