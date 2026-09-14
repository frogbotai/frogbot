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

## Actions

| Upstream action slug             | Previous wrapper export       | Native action             | Notes                                                                             |
| -------------------------------- | ----------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `zoom_create_meeting`            | `zoomCreateMeeting`           | `createMeeting`           |                                                                                   |
| `zoom_create_meeting_registrant` | `zoomCreateMeetingRegistrant` | `createMeetingRegistrant` |                                                                                   |
| `zoom_find_meeting`              | `zoomFindMeeting`             | `getMeeting`              | Meeting options load every scheduled-meeting page.                                |
| `zoom_update_meeting`            | `zoomUpdateMeeting`           | `updateMeeting`           | Meeting options load every scheduled-meeting page.                                |
| `custom_api_call`                | `customApiCall`               | `customApiCall`           | Restricted to the Zoom API origin; connection authorization cannot be overridden. |

The upstream piece registers no triggers.
