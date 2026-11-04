import { z } from 'zod';

const dateTimeTimeZone = z.object({ dateTime: z.string(), timeZone: z.string().nullish() });

export const event = z
  .object({
    id: z.string(),
    subject: z.string().nullish(),
    start: dateTimeTimeZone.nullish(),
    end: dateTimeTimeZone.nullish(),
    isAllDay: z.boolean().nullish(),
    location: z.object({ displayName: z.string().nullish() }).passthrough().nullish(),
    organizer: z
      .object({
        emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }),
      })
      .nullish(),
    attendees: z.array(z.object({}).passthrough()).nullish(),
    bodyPreview: z.string().nullish(),
    webLink: z.string().nullish(),
    onlineMeeting: z.object({ joinUrl: z.string().nullish() }).passthrough().nullish(),
    seriesMasterId: z.string().nullish(),
    type: z.string().nullish(),
  })
  .passthrough();

export const dateTime = z.iso.datetime({ offset: true, local: true }).meta({
  description:
    'ISO 8601, such as 2026-11-03T15:00:00Z. Without an offset, the time is read in timeZone.',
});

const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Graph's `{ dateTime, timeZone }`: a time with an offset becomes UTC, a local time keeps `timeZone`. */
export function graphDateTime(value: string, timeZone = 'UTC') {
  if (!hasOffset.test(value)) return { dateTime: value, timeZone };

  return { dateTime: new Date(value).toISOString().slice(0, 19), timeZone: 'UTC' };
}

export function calendarPath(mailbox: string, calendarId?: string) {
  return calendarId
    ? `${mailbox}/calendars/${encodeURIComponent(calendarId)}`
    : `${mailbox}/calendar`;
}
