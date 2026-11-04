import { hubspotApi } from '../client.js';
import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'HubSpot',
  description:
    'Call any HubSpot API endpoint with the connected credential, with a path such as /crm/v3/owners. Returns { status, headers, body }.',
  baseUrl: hubspotApi,
  authorize: ({ client, headers }) => client.authorize(headers),
});
