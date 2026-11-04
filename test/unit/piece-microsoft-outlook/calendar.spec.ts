import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-microsoft',
  () => import('../../../packages/pieces/piece-microsoft/src/index.js'),
);

import { createMicrosoftOutlook } from '../../../packages/pieces/piece-microsoft-outlook/src/index.js';
import { body, calls, json, req, stubGraph } from './fixtures.js';

const graph = 'https://graph.microsoft.com/v1.0';
const outlook = createMicrosoftOutlook({});
const event = {
  id: 'e1',
  subject: 'Demo',
  start: { dateTime: '2026-11-04T15:00:00.0000000', timeZone: 'UTC' },
  end: { dateTime: '2026-11-04T15:30:00.0000000', timeZone: 'UTC' },
};

afterEach(() => vi.unstubAllGlobals());

describe('Outlook calendar actions', () => {
  it('creates an event in UTC with attendees, defaulting the end to 30 minutes later', async () => {
    stubGraph(() => json(event, 201));

    const created = await outlook.createEvent({
      input: {
        subject: 'Demo',
        start: '2026-11-04T16:00:00+01:00',
        location: 'Room 1',
        attendees: ['dana@acme.com'],
      },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/calendar/events`, method: 'POST' });
    expect(body(calls[0])).toEqual({
      subject: 'Demo',
      start: { dateTime: '2026-11-04T15:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-11-04T15:30:00', timeZone: 'UTC' },
      location: { displayName: 'Room 1' },
      attendees: [{ emailAddress: { address: 'dana@acme.com' }, type: 'required' }],
    });
    expect(created).toMatchObject({ id: 'e1', subject: 'Demo' });
  });

  it('keeps a local time in the given time zone, in the chosen calendar', async () => {
    stubGraph(() => json(event, 201));

    await outlook.createEvent({
      input: {
        calendarId: 'cal/1',
        subject: 'Demo',
        start: '2026-11-04T09:00:00',
        end: '2026-11-04T10:00:00',
        timeZone: 'Europe/Paris',
        body: 'Agenda',
      },
      req: req(),
    });

    expect(calls[0]?.url).toBe(`${graph}/me/calendars/cal%2F1/events`);
    expect(body(calls[0])).toMatchObject({
      start: { dateTime: '2026-11-04T09:00:00', timeZone: 'Europe/Paris' },
      end: { dateTime: '2026-11-04T10:00:00', timeZone: 'Europe/Paris' },
      body: { contentType: 'text', content: 'Agenda' },
    });
  });

  it('deletes an event, and treats one that is already gone as done', async () => {
    stubGraph(() => new Response(null, { status: 204 }));

    await expect(outlook.deleteEvent({ input: { eventId: 'e1' }, req: req() })).resolves.toEqual({
      eventId: 'e1',
      found: true,
    });
    expect(calls[0]).toMatchObject({ url: `${graph}/me/events/e1`, method: 'DELETE' });

    stubGraph(() => json({ error: { code: 'ErrorItemNotFound', message: 'Gone.' } }, 404));

    await expect(outlook.deleteEvent({ input: { eventId: 'e1' }, req: req() })).resolves.toEqual({
      eventId: 'e1',
      found: false,
    });

    stubGraph(() => json({ error: { code: 'ErrorAccessDenied', message: 'No.' } }, 403));

    await expect(outlook.deleteEvent({ input: { eventId: 'e1' }, req: req() })).rejects.toThrow(
      'ErrorAccessDenied',
    );
  });

  it('lists every calendar across pages', async () => {
    stubGraph((call) =>
      call.url.includes('skip')
        ? json({ value: [{ id: 'c2', name: 'Team' }] })
        : json({
            value: [{ id: 'c1', name: 'Calendar', isDefaultCalendar: true }],
            '@odata.nextLink': `${graph}/me/calendars?skip=1`,
          }),
    );

    const calendars = await outlook.listCalendars({ input: {}, req: req() });

    expect(calls.map((call) => call.url)).toEqual([
      `${graph}/me/calendars`,
      `${graph}/me/calendars?skip=1`,
    ]);
    expect(calendars.map((calendar) => calendar.id)).toEqual(['c1', 'c2']);
  });

  it("finds people's busy periods with getSchedule", async () => {
    const schedule = {
      scheduleId: 'dana@acme.com',
      availabilityView: '0220',
      scheduleItems: [
        {
          status: 'busy',
          start: { dateTime: '2026-11-04T15:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2026-11-04T16:00:00.0000000', timeZone: 'UTC' },
        },
      ],
    };

    stubGraph(() => json({ value: [schedule] }));

    const result = await outlook.findFreeBusyPeriods({
      input: {
        emails: ['dana@acme.com'],
        start: '2026-11-04T14:00:00Z',
        end: '2026-11-04T18:00:00Z',
        intervalMinutes: 60,
      },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ url: `${graph}/me/calendar/getSchedule`, method: 'POST' });
    expect(body(calls[0])).toEqual({
      schedules: ['dana@acme.com'],
      startTime: { dateTime: '2026-11-04T14:00:00', timeZone: 'UTC' },
      endTime: { dateTime: '2026-11-04T18:00:00', timeZone: 'UTC' },
      availabilityViewInterval: 60,
    });
    expect(result).toEqual([schedule]);
  });

  it('explains that a personal account has no free/busy', async () => {
    stubGraph((call) =>
      call.url.includes('/organization')
        ? json({ value: [] })
        : json({ error: { code: 'ErrorInvalidRequest', message: 'Not supported.' } }, 400),
    );

    const input = {
      emails: ['dana@outlook.com'],
      start: '2026-11-04T14:00:00Z',
      end: '2026-11-04T18:00:00Z',
    };

    await expect(outlook.findFreeBusyPeriods({ input, req: req() })).rejects.toThrow(
      'free/busy needs a work or school account',
    );
    expect(calls[1]?.url).toBe(`${graph}/organization?%24select=id`);

    stubGraph((call) =>
      call.url.includes('/organization')
        ? json({ value: [{ id: 'org' }] })
        : json({ error: { code: 'ErrorInvalidRequest', message: 'Bad range.' } }, 400),
    );

    await expect(outlook.findFreeBusyPeriods({ input, req: req() })).rejects.toThrow('Bad range.');
  });
});
