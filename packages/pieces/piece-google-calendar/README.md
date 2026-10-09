# `@frogbotai/piece-google-calendar`

Create, find, and update Google Calendar events.

## Usage

```ts
import { createGoogle } from '@frogbotai/piece-google';
import { createGoogleCalendar } from '@frogbotai/piece-google-calendar';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
export const googleCalendar = createGoogleCalendar({ oauth: google.oauth });
```

## OAuth scopes

Change the requested scopes with the factory's `scopes` option: `createGoogleCalendar({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'calendar.events.readonly'] })` adds one, and an array replaces the defaults. `googleCalendarScopes` maps each name to the provider's scope string. Names stand for `https://www.googleapis.com/auth/<name>`, except `openid`.

- Always requested: `openid`, `userinfo.email`, `userinfo.profile`.
- Defaults: `calendar.events`, `calendar.readonly`.
- Also available: `calendar`, `calendar.events.readonly`, `calendar.events.owned`, `calendar.events.owned.readonly`, `calendar.events.freebusy`, `calendar.events.public.readonly`, `calendar.calendarlist`, `calendar.calendarlist.readonly`, `calendar.calendars`, `calendar.calendars.readonly`, `calendar.acls`, `calendar.acls.readonly`, `calendar.freebusy`, `calendar.settings.readonly`, `calendar.app.created`.
