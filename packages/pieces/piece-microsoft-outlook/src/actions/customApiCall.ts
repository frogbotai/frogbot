import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Microsoft Graph',
  description: 'Make an authenticated request within Microsoft Graph v1.0.',
  baseUrl: (client) => `${client.baseUrl}/v1.0`,
  authorize: ({ client, url, headers, req }) =>
    client.authorize(url, headers, req.signal ?? undefined),
});
