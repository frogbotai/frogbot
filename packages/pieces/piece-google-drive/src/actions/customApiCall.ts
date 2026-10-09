import { authorize } from '../client.js';
import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Google Drive',
  baseUrl: 'https://www.googleapis.com/drive/v3',
  authorize: ({ client, url, headers }) => authorize(client, url, headers),
});
