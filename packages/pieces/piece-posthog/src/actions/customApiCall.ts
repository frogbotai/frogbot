import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'PostHog',
  baseUrl: 'https://app.posthog.com',
  authorize: ({ client, headers }) => client.authorize(headers),
});
