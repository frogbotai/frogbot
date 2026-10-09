import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Resend',
  baseUrl: 'https://api.resend.com',
  authorize: ({ client, url, headers }) => client.authorize(url, headers),
});
