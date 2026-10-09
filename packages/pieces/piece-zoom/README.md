# `@frogbotai/piece-zoom`

Manage Zoom meetings and registrants through native FrogBot actions.

## Usage

```ts
import { createZoom } from '@frogbotai/piece-zoom';

export const zoom = createZoom({
  oauth: {
    clientId: process.env.ZOOM_CLIENT_ID!,
    clientSecret: process.env.ZOOM_CLIENT_SECRET!,
  },
});
```

## OAuth scopes

Change the requested scopes with the factory's `scopes` option: `createZoom({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'meeting:delete:meeting'] })` adds one, and an array replaces the defaults. `zoomScopes` maps each name to the provider's scope string.

- Always requested: `user:read:user`.
- Defaults: `meeting:write:meeting`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:update:meeting`, `meeting:write:registrant`.
- Also available: `meeting:delete:meeting`, `meeting:read:registrant`, `meeting:read:list_registrants`, `meeting:read:past_meeting`, `meeting:read:list_past_participants`, `user:read:email`, `user:read:settings`.

## Actions

| Upstream action slug             | Previous wrapper export       | Native action             | Notes                                                                             |
| -------------------------------- | ----------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `zoom_create_meeting`            | `zoomCreateMeeting`           | `createMeeting`           |                                                                                   |
| `zoom_create_meeting_registrant` | `zoomCreateMeetingRegistrant` | `createMeetingRegistrant` |                                                                                   |
| `zoom_find_meeting`              | `zoomFindMeeting`             | `getMeeting`              | Meeting options load every scheduled-meeting page.                                |
| `zoom_update_meeting`            | `zoomUpdateMeeting`           | `updateMeeting`           | Meeting options load every scheduled-meeting page.                                |
| `custom_api_call`                | `customApiCall`               | `customApiCall`           | Restricted to the Zoom API origin; connection authorization cannot be overridden. |

The upstream piece registers no triggers.
