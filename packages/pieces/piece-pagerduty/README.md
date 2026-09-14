# `@frogbotai/piece-pagerduty`

Manage PagerDuty incidents through its REST API and receive signed V3 webhook events.

## Usage

```ts
import { createPagerduty } from '@frogbotai/piece-pagerduty';

export const pagerduty = createPagerduty({
  auth: { apiKey: process.env.PAGERDUTY_API_KEY! },
  signingSecret: process.env.PAGERDUTY_WEBHOOK_SIGNING_SECRET!,
});
```

The signing secret is optional for action-only instances and required to authenticate webhook
deliveries. For each enabled trigger, copy its generated webhook URL into a PagerDuty V3 webhook
subscription, select the corresponding event type below, and configure the subscription with the
same signing secret. Registration and removal are manual; FrogBot stores the generated URL but does
not claim to create or delete the PagerDuty subscription.

## Actions

| Upstream action slug   | Previous wrapper export | Native action         | Notes                                                                                        |
| ---------------------- | ----------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `create_incident`      | `createIncident`        | `createIncident`      |                                                                                              |
| `list_incidents`       | `listIncidents`         | `listIncidents`       |                                                                                              |
| `get_incident`         | `getIncident`           | `getIncident`         |                                                                                              |
| `acknowledge_incident` | `acknowledgeIncident`   | `acknowledgeIncident` |                                                                                              |
| `resolve_incident`     | `resolveIncident`       | `resolveIncident`     |                                                                                              |
| `custom_api_call`      | `customApiCall`         | `customApiCall`       | Caller headers are intentionally unsupported so credentials cannot be replaced or forwarded. |

## Triggers

| Upstream trigger slug  | Native trigger         | Type    | Notes                                                  |
| ---------------------- | ---------------------- | ------- | ------------------------------------------------------ |
| `newIncident`          | `newIncident`          | Webhook | Manually register the URL for `incident.triggered`.    |
| `incidentResolved`     | `incidentResolved`     | Webhook | Manually register the URL for `incident.resolved`.     |
| `incidentAcknowledged` | `incidentAcknowledged` | Webhook | Manually register the URL for `incident.acknowledged`. |
