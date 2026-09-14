# `@frogbotai/piece-posthog`

Capture product analytics events, create projects, and call the PostHog API.

## Usage

```ts
import { createPosthog } from '@frogbotai/piece-posthog';

export const posthog = createPosthog({
  auth: { personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY! },
});
```

## Actions

| Upstream action slug | Previous wrapper export | Native action   | Notes                                                                       |
| -------------------- | ----------------------- | --------------- | --------------------------------------------------------------------------- |
| `create_event`       | `createEvent`           | `createEvent`   | Uses semantic input names while preserving the capture payload.             |
| `create_project`     | `createProject`         | `createProject` | Uses semantic input names while preserving PostHog field names on the wire. |
| `custom_api_call`    | `customApiCall`         | `customApiCall` | Restricted to authenticated `https://app.posthog.com` requests.             |

The upstream piece registers no triggers.
