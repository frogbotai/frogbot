import { authorize } from '../client.js';
import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Google Calendar',
  baseUrl: 'https://www.googleapis.com/calendar/v3',
  authorize: ({ client, url, headers }) => authorize(client, url, headers),
});
