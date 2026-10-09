import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Airtable',
  baseUrl: 'https://api.airtable.com/v0',
  authorize: ({ client, headers }) => client.authorize(headers),
});
