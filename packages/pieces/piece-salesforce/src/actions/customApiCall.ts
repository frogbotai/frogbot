import { dataRoot } from '../config.js';
import { defineCustomApiCall } from '../define.js';

export const customApiCall = defineCustomApiCall({
  name: 'Salesforce',
  description:
    "Call any Salesforce REST API endpoint on the connection's instance, with a path under /services/data/v68.0 such as /limits. Returns { status, headers, body }.",
  baseUrl: (client) => `${client.instanceUrl}${dataRoot}`,
  authorize: ({ client, headers }) => client.authorize(headers),
});
