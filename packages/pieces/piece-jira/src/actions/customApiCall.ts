import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Jira',
  description:
    'Call any Jira Cloud REST endpoint with the connected credential, with a path such as /rest/api/3/myself or /rest/agile/1.0/board. Returns { status, headers, body }.',
  baseUrl: (client) => client.baseUrl,
  path: /^\/rest\/(?:api\/3|agile\/1\.0)(?:\/|$)/,
  authorize: ({ client, url, headers }) => client.authorize(url, headers),
});
