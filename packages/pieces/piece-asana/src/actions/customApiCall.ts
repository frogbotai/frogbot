import { asanaApi } from '../client.js';
import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Asana',
  description:
    "Call any Asana REST endpoint with the connected credential, with a path such as /users/me. Request bodies go in Asana's { data } envelope. Returns { status, headers, body }.",
  baseUrl: asanaApi,
  authorize: ({ client, headers }) => client.authorize(headers),
});
