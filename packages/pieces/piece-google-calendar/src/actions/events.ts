import { randomUUID } from 'node:crypto';

import type { PieceRunArgs } from 'frogbot/pieces';
import type { calendar_v3 } from 'googleapis';
import { z } from 'zod';

import { type GoogleCalendar, requestOptions } from '../client.js';
import {
  calendarId,
  dateTime,
  eventFields,
  eventOutput,
  eventReference,
  sendUpdates,
  validRange,
} from '../config.js';
import { calendars, colors } from './options.js';

function eventBody(input: z.output<typeof eventFields>): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {};
  if (input.title !== undefined) body.summary = input.title;
  if (input.startDateTime !== undefined) body.start = { dateTime: input.startDateTime };
  if (input.endDateTime !== undefined) body.end = { dateTime: input.endDateTime };
  if (input.attendees !== undefined) body.attendees = input.attendees.map((email) => ({ email }));
  for (const field of ['location', 'description', 'colorId'] as const) {
    if (input[field] !== undefined) body[field] = input[field];
  }
  for (const field of [
    'guestsCanModify',
    'guestsCanInviteOthers',
    'guestsCanSeeOtherGuests',
  ] as const) {
    if (input[field] !== undefined) body[field] = input[field];
  }
  if (input.createMeetLink) {
    body.conferenceData = {
      createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    };
  }
  return body;
}

const createInput = eventFields
  .extend({
    calendarId,
    title: z.string().min(1),
    startDateTime: dateTime,
    sendUpdates: sendUpdates.default('all'),
    guestsCanModify: z.boolean().default(false),
    guestsCanInviteOthers: z.boolean().default(false),
    guestsCanSeeOtherGuests: z.boolean().default(false),
  })
  .refine((input) => validRange({ start: input.startDateTime, end: input.endDateTime }), {
    message: 'End date must be after start date.',
    path: ['endDateTime'],
  });
export const createEvent = {
  slug: 'createEvent',
  description:
    'Create an event with attendees, guest permissions, notifications, and an optional Google Meet conference. Duration defaults to 30 minutes.',
  input: createInput,
  output: eventOutput,
  idempotent: false,
  options: { calendarId: calendars('writer'), colorId: colors },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof createInput>, object, GoogleCalendar>) {
    const body = eventBody(input);
    body.end ??= {
      dateTime: new Date(Date.parse(input.startDateTime) + 30 * 60_000).toISOString(),
    };
    return (
      await client.events.insert(
        {
          calendarId: input.calendarId,
          sendUpdates: input.sendUpdates,
          conferenceDataVersion: input.createMeetLink ? 1 : 0,
          requestBody: body,
        },
        requestOptions(req),
      )
    ).data;
  },
};

const updateInput = eventReference
  .extend(eventFields.shape)
  .refine((input) => validRange({ start: input.startDateTime, end: input.endDateTime }), {
    message: 'End date must be after start date.',
    path: ['endDateTime'],
  });
export const updateEvent = {
  slug: 'updateEvent',
  description:
    'Update only supplied event fields, preserving omitted fields. An empty attendees array clears guests.',
  input: updateInput,
  output: eventOutput,
  idempotent: false,
  options: { calendarId: calendars('writer'), colorId: colors },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof updateInput>, object, GoogleCalendar>) {
    const reference = { calendarId: input.calendarId, eventId: input.eventId };
    const { data: existing } = await client.events.get(reference, requestOptions(req));
    const body = eventBody(input);
    if (body.start) body.start = { date: null, timeZone: existing.start?.timeZone, ...body.start };
    if (body.end) body.end = { date: null, timeZone: existing.end?.timeZone, ...body.end };
    if (
      !validRange({
        start: body.start?.dateTime ?? existing.start?.dateTime,
        end: body.end?.dateTime ?? existing.end?.dateTime,
      })
    ) {
      throw new Error('End date must be after start date.');
    }
    return (
      await client.events.patch(
        {
          ...reference,
          sendUpdates: input.sendUpdates,
          conferenceDataVersion: input.createMeetLink ? 1 : undefined,
          requestBody: body,
        },
        {
          ...requestOptions(req),
          headers: existing.etag ? { 'If-Match': existing.etag } : undefined,
        },
      )
    ).data;
  },
};

const attendeesInput = eventReference.extend({
  attendees: z.array(z.email()).min(1),
  sendUpdates: sendUpdates.optional(),
});
export const addAttendees = {
  slug: 'addAttendees',
  description:
    'Append attendees to an event while retaining existing attendees and their RSVP details.',
  input: attendeesInput,
  output: eventOutput,
  idempotent: false,
  options: { calendarId: calendars('writer') },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof attendeesInput>, object, GoogleCalendar>) {
    const reference = { calendarId: input.calendarId, eventId: input.eventId };
    const { data: existing } = await client.events.get(reference, requestOptions(req));
    return (
      await client.events.patch(
        {
          ...reference,
          sendUpdates: input.sendUpdates,
          requestBody: {
            attendees: [
              ...(existing.attendees ?? []),
              ...input.attendees.map((email) => ({ email })),
            ],
          },
        },
        {
          ...requestOptions(req),
          headers: existing.etag ? { 'If-Match': existing.etag } : undefined,
        },
      )
    ).data;
  },
};

const quickInput = z.object({
  calendarId,
  text: z.string().trim().min(1),
  sendUpdates: sendUpdates.default('none'),
});
export const createQuickEvent = {
  slug: 'createQuickEvent',
  description:
    'Create an event from a natural-language description using Google Calendar quick add.',
  input: quickInput,
  output: eventOutput,
  idempotent: false,
  options: { calendarId: calendars('writer') },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof quickInput>, object, GoogleCalendar>) {
    return (await client.events.quickAdd(input, requestOptions(req))).data;
  },
};

const deleteInput = eventReference.extend({ sendUpdates: sendUpdates.optional() });
export const deleteEvent = {
  slug: 'deleteEvent',
  description: 'Delete an event, optionally notifying guests.',
  input: deleteInput,
  output: z.object({ deleted: z.literal(true) }),
  idempotent: true,
  options: { calendarId: calendars('writer') },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof deleteInput>, object, GoogleCalendar>) {
    await client.events.delete(input, requestOptions(req));
    return { deleted: true as const };
  },
};
