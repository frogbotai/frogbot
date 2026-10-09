import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Dropbox',
  baseUrl: 'https://api.dropboxapi.com/2',
  authorize: ({ client, headers }) => client.authorize(headers),
});
