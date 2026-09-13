import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { type GoogleCalendar, requestOptions } from '../client.js';
import { calendarId, dateTime, eventOutput, eventReference, validRange } from '../config.js';
import { calendars } from './options.js';

const getInput = eventReference.extend({
  maxAttendees: z.number().int().positive().optional(),
  timeZone: z.string().trim().min(1).optional(),
});
export const getEvent = {
  slug: 'getEvent',
  description:
    'Get an event by ID, optionally limiting attendees and choosing a response time zone.',
  input: getInput,
  output: eventOutput,
  idempotent: true,
  options: { calendarId: calendars() },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof getInput>, object, GoogleCalendar>) {
    return (await client.events.get(input, requestOptions(req))).data;
  },
};

const listInput = z
  .object({
    calendarId,
    eventTypes: z
      .array(
        z.enum(['default', 'focusTime', 'outOfOffice', 'workingLocation', 'birthday', 'fromGmail']),
      )
      .default(['default', 'focusTime', 'outOfOffice']),
    search: z.string().optional(),
    startDate: dateTime.optional(),
    endDate: dateTime.optional(),
    singleEvents: z.boolean().default(false),
    maxResults: z.number().int().min(1).max(2500).optional(),
    pageToken: z.string().min(1).optional(),
  })
  .refine((input) => validRange({ start: input.startDate, end: input.endDate }), {
    message: 'End date must be after start date.',
    path: ['endDate'],
  });
export const listEvents = {
  slug: 'listEvents',
  description:
    'List a page of events, filtering by type, search, and dates, with optional recurring-event expansion.',
  input: listInput,
  output: z
    .object({
      kind: z.string().nullish(),
      etag: z.string().nullish(),
      summary: z.string().nullish(),
      timeZone: z.string().nullish(),
      nextPageToken: z.string().nullish(),
      nextSyncToken: z.string().nullish(),
      items: z.array(eventOutput).optional(),
    })
    .passthrough(),
  idempotent: true,
  options: { calendarId: calendars() },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof listInput>, object, GoogleCalendar>) {
    return (
      await client.events.list(
        {
          calendarId: input.calendarId,
          eventTypes: input.eventTypes.length ? input.eventTypes : undefined,
          q: input.search ? `"${input.search}"` : undefined,
          timeMin: input.startDate,
          timeMax: input.endDate,
          singleEvents: input.singleEvents,
          showDeleted: false,
          maxResults: input.maxResults,
          pageToken: input.pageToken,
        },
        requestOptions(req),
      )
    ).data;
  },
};

const freeBusyInput = z
  .object({
    calendarIds: z.array(calendarId).min(1).max(50),
    startDate: dateTime,
    endDate: dateTime,
  })
  .refine((input) => validRange({ start: input.startDate, end: input.endDate }), {
    message: 'End date must be after start date.',
    path: ['endDate'],
  });
const freeBusyError = z.object({ domain: z.string().nullish(), reason: z.string().nullish() });
export const findFreeBusyPeriods = {
  slug: 'findFreeBusyPeriods',
  description:
    'Find busy intervals and per-calendar errors within a time range. Gaps between busy intervals are free.',
  input: freeBusyInput,
  output: z
    .object({
      kind: z.string().nullish(),
      timeMin: z.string().nullish(),
      timeMax: z.string().nullish(),
      calendars: z
        .record(
          z.string(),
          z.object({
            busy: z
              .array(z.object({ start: z.string().nullish(), end: z.string().nullish() }))
              .optional(),
            errors: z.array(freeBusyError).optional(),
          }),
        )
        .optional(),
      groups: z
        .record(
          z.string(),
          z.object({
            calendars: z.array(z.string()).optional(),
            errors: z.array(freeBusyError).optional(),
          }),
        )
        .optional(),
    })
    .passthrough(),
  idempotent: true,
  options: { calendarIds: calendars() },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof freeBusyInput>, object, GoogleCalendar>) {
    return (
      await client.freebusy.query(
        {
          requestBody: {
            timeMin: input.startDate,
            timeMax: input.endDate,
            items: input.calendarIds.map((id) => ({ id })),
          },
        },
        requestOptions(req),
      )
    ).data;
  },
};
