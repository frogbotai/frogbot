import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Zoom',
  baseUrl: 'https://api.zoom.us/v2',
  authorize: ({ client, headers }) => client.authorize(headers),
});
