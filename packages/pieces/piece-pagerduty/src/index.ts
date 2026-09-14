import { definePiece } from 'frogbot/pieces';

import {
  acknowledgeIncident,
  createIncident,
  customApiCall,
  getIncident,
  listIncidents,
  resolveIncident,
} from './actions.js';
import { createPagerdutyClient } from './client.js';
import { pagerdutyAuth, pagerdutyOptions } from './config.js';
import { incidentAcknowledged, incidentResolved, newIncident } from './triggers.js';
import { pagerdutyWebhook } from './webhook.js';

export const pagerdutyActions = [
  'createIncident',
  'listIncidents',
  'getIncident',
  'acknowledgeIncident',
  'resolveIncident',
  'customApiCall',
] as const;
export const pagerdutyTriggers = [
  'newIncident',
  'incidentResolved',
  'incidentAcknowledged',
] as const;
export const pagerdutyScopes = [] as const;

export const createPagerduty = definePiece({
  slug: 'pagerduty',
  label: 'PagerDuty',
  admin: {
    description: 'Manage PagerDuty incidents and receive incident events',
    group: 'Developer Tools',
  },
  auth: pagerdutyAuth,
  options: pagerdutyOptions,
  client: createPagerdutyClient,
  actions: [
    createIncident,
    listIncidents,
    getIncident,
    acknowledgeIncident,
    resolveIncident,
    customApiCall,
  ],
  triggers: [newIncident, incidentResolved, incidentAcknowledged],
  webhook: pagerdutyWebhook,
});
