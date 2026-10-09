import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Notion',
  baseUrl: 'https://api.notion.com/v1',
  headers: { 'notion-version': '2022-02-22' },
  authorize: ({ client, headers }) => client.authorize(headers),
});
