import { authorize } from '../client.js';
import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Gmail',
  baseUrl: 'https://gmail.googleapis.com/gmail/v1',
  authorize: ({ client, url, headers }) => authorize(client, url, headers),
});
