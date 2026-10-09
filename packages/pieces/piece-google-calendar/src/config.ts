import { z } from 'zod';

export const googleCalendarAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().min(1).optional().meta({ label: 'Refresh token', secret: true }),
});
export const googleCalendarScopes = {
  calendar: 'https://www.googleapis.com/auth/calendar',
  'calendar.readonly': 'https://www.googleapis.com/auth/calendar.readonly',
  'calendar.events': 'https://www.googleapis.com/auth/calendar.events',
  'calendar.events.readonly': 'https://www.googleapis.com/auth/calendar.events.readonly',
  'calendar.events.owned': 'https://www.googleapis.com/auth/calendar.events.owned',
  'calendar.events.owned.readonly':
    'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  'calendar.events.freebusy': 'https://www.googleapis.com/auth/calendar.events.freebusy',
  'calendar.events.public.readonly':
    'https://www.googleapis.com/auth/calendar.events.public.readonly',
  'calendar.calendarlist': 'https://www.googleapis.com/auth/calendar.calendarlist',
  'calendar.calendarlist.readonly':
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'calendar.calendars': 'https://www.googleapis.com/auth/calendar.calendars',
  'calendar.calendars.readonly': 'https://www.googleapis.com/auth/calendar.calendars.readonly',
  'calendar.acls': 'https://www.googleapis.com/auth/calendar.acls',
  'calendar.acls.readonly': 'https://www.googleapis.com/auth/calendar.acls.readonly',
  'calendar.freebusy': 'https://www.googleapis.com/auth/calendar.freebusy',
  'calendar.settings.readonly': 'https://www.googleapis.com/auth/calendar.settings.readonly',
  'calendar.app.created': 'https://www.googleapis.com/auth/calendar.app.created',
} as const;

export const calendarId = z.string().trim().min(1).meta({ label: 'Calendar' });
export const eventId = z.string().trim().min(5).max(1024).meta({ label: 'Event ID' });
export const dateTime = z.iso.datetime({ offset: true });
export const sendUpdates = z.enum(['all', 'externalOnly', 'none']);
export const eventReference = z.object({ calendarId, eventId });
export const eventFields = z.object({
  title: z.string().optional(),
  startDateTime: dateTime.optional(),
  endDateTime: dateTime.optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  colorId: z.string().optional(),
  attendees: z.array(z.email()).optional(),
  guestsCanModify: z.boolean().optional(),
  guestsCanInviteOthers: z.boolean().optional(),
  guestsCanSeeOtherGuests: z.boolean().optional(),
  sendUpdates: sendUpdates.optional(),
  createMeetLink: z.boolean().optional(),
});

const eventDateTime = z
  .object({
    date: z.string().nullish(),
    dateTime: z.string().nullish(),
    timeZone: z.string().nullish(),
  })
  .passthrough();

export const eventOutput = z
  .object({
    id: z.string().nullish(),
    kind: z.string().nullish(),
    etag: z.string().nullish(),
    status: z.string().nullish(),
    summary: z.string().nullish(),
    description: z.string().nullish(),
    location: z.string().nullish(),
    htmlLink: z.string().nullish(),
    hangoutLink: z.string().nullish(),
    colorId: z.string().nullish(),
    eventType: z.string().nullish(),
    start: eventDateTime.optional(),
    end: eventDateTime.optional(),
    recurrence: z.array(z.string()).nullish(),
    recurringEventId: z.string().nullish(),
    attendees: z
      .array(
        z
          .object({
            email: z.string().nullish(),
            displayName: z.string().nullish(),
            responseStatus: z.string().nullish(),
            optional: z.boolean().nullish(),
            organizer: z.boolean().nullish(),
            self: z.boolean().nullish(),
          })
          .passthrough(),
      )
      .optional(),
    guestsCanModify: z.boolean().nullish(),
    guestsCanInviteOthers: z.boolean().nullish(),
    guestsCanSeeOtherGuests: z.boolean().nullish(),
    conferenceData: z
      .object({
        conferenceId: z.string().nullish(),
        createRequest: z
          .object({
            requestId: z.string().nullish(),
            status: z.object({ statusCode: z.string().nullish() }).passthrough().optional(),
          })
          .passthrough()
          .optional(),
        entryPoints: z
          .array(
            z
              .object({
                entryPointType: z.string().nullish(),
                uri: z.string().nullish(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function validRange({ start, end }: { start?: string | null; end?: string | null }) {
  return !start || !end || Date.parse(end) > Date.parse(start);
}
