import { pieceConformance } from 'frogbot/pieces/test';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  'frogbot/pieces/test',
  () => import('../../../packages/frogbot/src/exports/pieces-test.js'),
);

vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { oauthScopes } from '../../../packages/frogbot/src/connections/oauth/scopes.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { googleOAuth } from '../../../packages/pieces/piece-google/src/index.js';
import {
  calendars,
  colors,
} from '../../../packages/pieces/piece-google-calendar/src/actions/options.js';
import { createGoogleCalendarClient } from '../../../packages/pieces/piece-google-calendar/src/client.js';
import { googleCalendarAuth } from '../../../packages/pieces/piece-google-calendar/src/config.js';
import {
  createGoogleCalendar,
  googleCalendarActions,
  googleCalendarScopes,
} from '../../../packages/pieces/piece-google-calendar/src/index.js';

const auth = { accessToken: 'calendar-test-token' };
const reference = { calendarId: 'calendar@example.com', eventId: 'event123' };
const start = '2026-09-12T10:00:00Z';
const end = '2026-09-12T11:00:00Z';
const existing = {
  id: reference.eventId,
  etag: '"revision-one"',
  summary: 'Original',
  description: 'Keep this description',
  location: 'Office',
  colorId: '3',
  start: { dateTime: start, timeZone: 'America/New_York' },
  end: { dateTime: end, timeZone: 'America/New_York' },
  attendees: [{ email: 'existing@example.com', responseStatus: 'accepted', optional: true }],
  recurrence: ['RRULE:FREQ=WEEKLY'],
  guestsCanModify: true,
  guestsCanInviteOthers: true,
  guestsCanSeeOtherGuests: true,
  reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 15 }] },
  conferenceData: { conferenceId: 'existing-meet' },
};

const busy = {
  timeMin: start,
  timeMax: end,
  calendars: {
    [reference.calendarId]: { busy: [{ start, end }] },
    inaccessible: { errors: [{ domain: 'global', reason: 'notFound' }] },
  },
};

type TransportConfig = {
  url: string | URL;
  method?: string;
  headers?: Headers;
  params?: Record<string, any>;
  data?: any;
  signal?: AbortSignal;
  retry?: boolean;
  redirect?: string;
  maxRedirects?: number;
  timeout?: number;
  responseType?: string;
  validateStatus?: (status: number) => boolean;
};

function response(data: unknown, config: TransportConfig, status = 200) {
  return {
    data,
    config,
    headers: new Headers({ 'content-type': 'application/json' }),
    status,
    statusText: 'OK',
  };
}

function route(config: TransportConfig) {
  config.signal?.throwIfAborted();
  const url = String(config.url);
  if (url.endsWith('/users/me/calendarList')) {
    return response(
      config.params?.pageToken
        ? {
            items: [{ id: 'secondary', summary: 'Secondary' }],
          }
        : {
            items: [{ id: reference.calendarId, summary: 'Calendar' }],
            nextPageToken: 'page-two',
          },
      config,
    );
  }

  if (url.endsWith('/colors')) {
    return response({ event: { '3': { background: '#123456', foreground: '#ffffff' } } }, config);
  }

  if (url.endsWith('/freeBusy')) return response(busy, config);
  if (url.endsWith('/quickAdd')) {
    return response({ id: 'quick123', summary: config.params?.text }, config);
  }

  if (url.endsWith('/events') && config.method === 'GET') {
    return response({ items: [existing], nextPageToken: 'next-events' }, config);
  }

  if (url.endsWith('/events') && config.method === 'POST') {
    return response({ id: 'created123', ...config.data }, config);
  }

  if (url.endsWith('/event123')) {
    if (config.method === 'DELETE') return response('', config, 204);
    if (config.method === 'PATCH') return response({ ...existing, ...config.data }, config);

    return response(existing, config);
  }

  return response({ ok: true }, config);
}

const transport = vi.fn(
  (config: TransportConfig) =>
    new Promise<ReturnType<typeof response>>((resolve) => resolve(route(config))),
);

const fetchMock = vi.fn<typeof fetch>();

function lastFetch() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('Missing Calendar fetch request.');

  return call as [URL, RequestInit];
}

function request(signal?: AbortSignal) {
  const key = {};

  return {
    signal,
    frogbot: { connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key }) } },
    user: null,
  } as never;
}

async function fixture(signal?: AbortSignal) {
  const req = request(signal);
  const calendar = createGoogleCalendar({ auth });
  const client = await calendar.client({ req });

  return { req, calendar, client };
}

function lastCall() {
  const call = transport.mock.calls.at(-1)?.[0];
  if (!call) throw new Error('Missing Calendar transport request.');

  return call;
}

beforeEach(() => {
  transport.mockClear();
  const oauth = new google.auth.OAuth2();
  const transporter: { request: (config: TransportConfig) => Promise<unknown> } =
    Object.getPrototypeOf(oauth.transporter);

  vi.spyOn(transporter, 'request').mockImplementation(transport);
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native Google Calendar', () => {
  it('declares nine semantic actions, meaningful schemas, shared identity, and secret credentials', () => {
    const piece = createGoogleCalendar({ oauth: { clientId: 'client', clientSecret: 'secret' } });

    expect(pieceInstanceTools(piece)?.map((action) => action.slug)).toEqual(
      googleCalendarActions.map((slug) => `google-calendar_${slug}`),
    );
    expect(Object.keys(piece.triggers)).toEqual([]);

    const definition = pieceFactoryDefinition(createGoogleCalendar);

    expect(definition.oauth?.account).toBe(googleOAuth.account);
    expect(oauthScopes(createGoogleCalendar())).toEqual([
      ...Object.values(googleOAuth.scopes.catalog),
      googleCalendarScopes['calendar.events'],
      googleCalendarScopes['calendar.readonly'],
    ]);
    expect(
      definition.oauth?.toAuth?.({ tokens: { access_token: 'access', refresh_token: 'refresh' } }),
    ).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(definition.oauth?.toAuth?.({ tokens: { access_token: 'access' } })).toEqual({
      accessToken: 'access',
      refreshToken: undefined,
    });
    expect(definition.auth).toBe(googleCalendarAuth);
    expect(z.toJSONSchema(googleCalendarAuth)).toMatchObject({
      properties: {
        accessToken: { secret: true },
        refreshToken: { secret: true },
      },
    });
    expect(() => createGoogleCalendarClient({ auth: {} })).toThrow();

    const client = createGoogleCalendarClient({ auth: { ...auth, refreshToken: 'refresh-test' } });

    expect(client.context._options.auth).toMatchObject({
      credentials: { access_token: auth.accessToken, refresh_token: 'refresh-test' },
    });

    for (const action of definition.actions) {
      expect(z.toJSONSchema(action.input).type).toBe('object');
      expect(z.toJSONSchema(action.output!).type).toBe('object');
    }
  });

  it('passes native conformance through real SDK requests for every action and options provider', async () => {
    const calendarOptions = [
      { label: 'Calendar', value: reference.calendarId },
      { label: 'Secondary', value: 'secondary' },
    ];

    await pieceConformance(createGoogleCalendar, {
      factoryOptions: { auth },
      oauth: true,
      triggers: [],
      actions: [
        {
          slug: 'addAttendees',
          input: { ...reference, attendees: ['new@example.com'] },
          expect: {
            result: {
              ...existing,
              attendees: [...existing.attendees, { email: 'new@example.com' }],
            },
          },
        },
        {
          slug: 'createQuickEvent',
          input: { calendarId: reference.calendarId, text: 'Lunch tomorrow at noon' },
          expect: { result: { id: 'quick123', summary: 'Lunch tomorrow at noon' } },
        },
        {
          slug: 'createEvent',
          input: { calendarId: reference.calendarId, title: 'Meeting', startDateTime: start },
          expect: {
            result: {
              id: 'created123',
              summary: 'Meeting',
              start: { dateTime: start },
              end: { dateTime: '2026-09-12T10:30:00.000Z' },
              guestsCanModify: false,
              guestsCanInviteOthers: false,
              guestsCanSeeOtherGuests: false,
            },
          },
        },
        {
          slug: 'listEvents',
          input: { calendarId: reference.calendarId },
          expect: { result: { items: [existing], nextPageToken: 'next-events' } },
        },
        {
          slug: 'updateEvent',
          input: { ...reference, title: 'Renamed' },
          expect: { result: { ...existing, summary: 'Renamed' } },
        },
        { slug: 'deleteEvent', input: reference, expect: { result: { deleted: true } } },
        {
          slug: 'findFreeBusyPeriods',
          input: {
            calendarIds: [reference.calendarId, 'inaccessible'],
            startDate: start,
            endDate: end,
          },
          expect: { result: busy },
        },
        { slug: 'getEvent', input: reference, expect: { result: existing } },
        {
          slug: 'customApiCall',
          input: { method: 'GET', path: '/custom' },
          expect: {
            result: {
              status: 200,
              headers: { 'content-type': 'application/json' },
              body: { ok: true },
            },
          },
        },
      ],
      options: [
        ...[
          'addAttendees',
          'createQuickEvent',
          'createEvent',
          'listEvents',
          'updateEvent',
          'deleteEvent',
          'getEvent',
        ].map((action) => ({ action, field: 'calendarId', expect: calendarOptions })),
        { action: 'findFreeBusyPeriods', field: 'calendarIds', expect: calendarOptions },
        ...['createEvent', 'updateEvent'].map((action) => ({
          action,
          field: 'colorId',
          expect: [{ label: '#123456', value: '3' }],
        })),
      ],
    });

    for (const [config] of transport.mock.calls) {
      expect(config.headers?.get('authorization')).toBe(`Bearer ${auth.accessToken}`);
    }
  });

  it('merges attendee records without dropping RSVP state and protects concurrent changes', async () => {
    const { calendar, req } = await fixture();

    await calendar.addAttendees({
      input: { ...reference, attendees: ['new@example.com'], sendUpdates: 'all' },
      req,
    });

    expect(lastCall()).toMatchObject({
      method: 'PATCH',
      data: { attendees: [...existing.attendees, { email: 'new@example.com' }] },
      params: { sendUpdates: 'all' },
      retry: false,
    });
    expect(lastCall().headers?.get('if-match')).toBe(existing.etag);
    expect(Object.keys(lastCall().data)).toEqual(['attendees']);
  });

  it('creates complete events and distinct Google Meet request IDs', async () => {
    const { calendar, req } = await fixture();
    const input = {
      calendarId: reference.calendarId,
      title: 'Meet',
      startDateTime: start,
      endDateTime: end,
      location: 'Home',
      description: '<b>Agenda</b>',
      colorId: '3',
      attendees: ['guest@example.com'],
      guestsCanModify: true,
      guestsCanInviteOthers: true,
      guestsCanSeeOtherGuests: true,
      sendUpdates: 'externalOnly' as const,
      createMeetLink: true,
    };

    await calendar.createEvent({ input, req });
    const first = lastCall();

    expect(first).toMatchObject({
      method: 'POST',
      params: { sendUpdates: 'externalOnly', conferenceDataVersion: 1 },
      data: {
        summary: 'Meet',
        start: { dateTime: start },
        end: { dateTime: end },
        location: 'Home',
        description: '<b>Agenda</b>',
        colorId: '3',
        attendees: [{ email: 'guest@example.com' }],
        guestsCanModify: true,
        guestsCanInviteOthers: true,
        guestsCanSeeOtherGuests: true,
        conferenceData: {
          createRequest: {
            requestId: expect.any(String),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });

    await calendar.createEvent({ input, req });

    expect(lastCall().data.conferenceData.createRequest.requestId).not.toBe(
      first.data.conferenceData.createRequest.requestId,
    );
  });

  it('keeps omitted update fields and allows explicit clearing and false values', async () => {
    const { calendar, req } = await fixture();

    await expect(
      calendar.updateEvent({ input: { ...reference, title: 'Only title' }, req }),
    ).resolves.toEqual({ ...existing, summary: 'Only title' });
    expect(lastCall().data).toEqual({ summary: 'Only title' });

    await calendar.updateEvent({
      input: {
        ...reference,
        description: '',
        location: '',
        attendees: [],
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false,
        colorId: '0',
      },
      req,
    });

    expect(lastCall().data).toEqual({
      description: '',
      location: '',
      attendees: [],
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: false,
      colorId: '0',
    });

    await calendar.updateEvent({
      input: {
        ...reference,
        startDateTime: '2026-09-12T10:15:00Z',
        createMeetLink: true,
        sendUpdates: 'none',
      },
      req,
    });

    expect(lastCall()).toMatchObject({
      params: { conferenceDataVersion: 1, sendUpdates: 'none' },
      data: {
        start: { date: null, dateTime: '2026-09-12T10:15:00Z', timeZone: 'America/New_York' },
      },
    });
    expect(lastCall().data).not.toHaveProperty('end');
    await expect(
      calendar.updateEvent({ input: { ...reference, startDateTime: '2026-09-12T12:00:00Z' }, req }),
    ).rejects.toThrow('End date must be after start date.');
    expect(lastCall().method).toBe('GET');
  });

  it('maps quick-add notifications and encoded event identifiers', async () => {
    const { calendar, req } = await fixture();

    await calendar.createQuickEvent({
      input: { calendarId: reference.calendarId, text: 'Lunch Friday' },
      req,
    });

    expect(lastCall()).toMatchObject({
      method: 'POST',
      params: { text: 'Lunch Friday', sendUpdates: 'none' },
    });

    await calendar.getEvent({
      input: {
        calendarId: 'user+calendar@example.com',
        eventId: 'event/id',
        maxAttendees: 4,
        timeZone: 'Europe/London',
      },
      req,
    });

    expect(String(lastCall().url)).toContain(
      '/calendars/user%2Bcalendar%40example.com/events/event%2Fid',
    );
    expect(lastCall().params).toMatchObject({ maxAttendees: 4, timeZone: 'Europe/London' });

    await calendar.deleteEvent({ input: { ...reference, sendUpdates: 'externalOnly' }, req });

    expect(lastCall()).toMatchObject({ method: 'DELETE', params: { sendUpdates: 'externalOnly' } });
  });

  it('maps search, all event types, recurrence expansion, upper-only bounds, and page controls', async () => {
    const { calendar, req } = await fixture();

    await calendar.listEvents({
      input: {
        calendarId: reference.calendarId,
        eventTypes: ['workingLocation', 'focusTime'],
        search: 'planning',
        startDate: start,
        endDate: end,
        singleEvents: true,
        maxResults: 10,
        pageToken: 'next',
      },
      req,
    });

    expect(lastCall().params).toMatchObject({
      eventTypes: ['workingLocation', 'focusTime'],
      q: '"planning"',
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      showDeleted: false,
      maxResults: 10,
      pageToken: 'next',
    });

    await calendar.listEvents({
      input: { calendarId: reference.calendarId, endDate: end, eventTypes: [] },
      req,
    });

    expect(lastCall().params).toMatchObject({ timeMax: end, singleEvents: false });
    expect(lastCall().params?.eventTypes).toBeUndefined();
  });

  it('requests multiple free/busy calendars and preserves per-calendar errors', async () => {
    const { calendar, req } = await fixture();

    await expect(
      calendar.findFreeBusyPeriods({
        input: {
          calendarIds: [reference.calendarId, 'inaccessible'],
          startDate: start,
          endDate: end,
        },
        req,
      }),
    ).resolves.toEqual(busy);
    expect(lastCall()).toMatchObject({
      method: 'POST',
      data: {
        timeMin: start,
        timeMax: end,
        items: [{ id: reference.calendarId }, { id: 'inaccessible' }],
      },
    });
  });

  it('paginates writable calendar choices and tolerates empty calendar/color responses', async () => {
    const { client, req } = await fixture();

    expect(await calendars('writer')({ client, req })).toHaveLength(2);
    expect(transport.mock.calls.map(([config]) => config.params)).toEqual([
      expect.objectContaining({ maxResults: 250, minAccessRole: 'writer' }),
      expect.objectContaining({ pageToken: 'page-two', minAccessRole: 'writer' }),
    ]);

    transport.mockImplementationOnce((config) => Promise.resolve(response({}, config)));

    expect(await calendars()({ client, req })).toEqual([]);

    transport.mockImplementationOnce((config) => Promise.resolve(response({}, config)));

    expect(await colors({ client, req })).toEqual([]);
  });

  it.each([
    ['getEvent', { ...reference, calendarId: ' ' }],
    ['getEvent', { ...reference, eventId: 'a' }],
    ['getEvent', { ...reference, eventId: 'a'.repeat(1025) }],
    ['getEvent', { ...reference, maxAttendees: 0 }],
    ['getEvent', { ...reference, maxAttendees: 1.5 }],
    ['addAttendees', { ...reference, attendees: ['not-an-email'] }],
    ['addAttendees', { ...reference, attendees: [] }],
    ['createEvent', { calendarId: 'primary', title: 'Test', startDateTime: 'tomorrow' }],
    [
      'createEvent',
      { calendarId: 'primary', title: 'Test', startDateTime: start, endDateTime: start },
    ],
    ['updateEvent', { ...reference, startDateTime: end, endDateTime: start }],
    ['listEvents', { calendarId: 'primary', maxResults: 2501 }],
    ['listEvents', { calendarId: 'primary', startDate: end, endDate: start }],
    ['findFreeBusyPeriods', { calendarIds: [], startDate: start, endDate: end }],
    ['findFreeBusyPeriods', { calendarIds: ['primary'], startDate: end, endDate: start }],
  ])('rejects invalid %s input before transport', async (slug, input) => {
    const { calendar, req } = await fixture();

    await expect(
      (
        calendar[slug as keyof typeof calendar] as (args: {
          input: unknown;
          req: typeof req;
        }) => Promise<unknown>
      )({ input, req }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 412, 429, 500])(
    'propagates provider %i failures',
    async (status) => {
      const { calendar, req } = await fixture();
      const error = Object.assign(new Error(`Provider failure ${status}`), {
        config: {},
        response: {
          status,
          config: {},
          data: { error: { message: `Provider failure ${status}` } },
        },
        code: status,
      });

      transport.mockRejectedValueOnce(error);

      await expect(calendar.getEvent({ input: reference, req })).rejects.toBe(error);
    },
  );

  it('propagates cancellation before calls and between read/write requests', async () => {
    const controller = new AbortController();
    const { calendar, client, req } = await fixture(controller.signal);
    await calendar.getEvent({ input: reference, req });

    expect(lastCall().signal).toBe(controller.signal);

    controller.abort(new Error('Cancelled by caller'));
    transport.mockClear();

    await expect(calendar.getEvent({ input: reference, req })).rejects.toThrow(
      'Cancelled by caller',
    );
    await expect(colors({ client, req })).rejects.toThrow('Cancelled by caller');
    expect(transport).not.toHaveBeenCalled();

    const next = new AbortController();
    const second = await fixture(next.signal);

    transport.mockImplementationOnce((config) => {
      next.abort(new Error('Cancelled after read'));

      return Promise.resolve(response(existing, config));
    });

    await expect(
      second.calendar.addAttendees({
        input: { ...reference, attendees: ['new@example.com'] },
        req: second.req,
      }),
    ).rejects.toThrow('Cancelled after read');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(googleCalendarActions.filter((slug) => slug !== 'customApiCall'))(
    '%s forwards transport failures and request cancellation',
    async (slug) => {
      const inputs = {
        addAttendees: { ...reference, attendees: ['guest@example.com'] },
        createQuickEvent: { calendarId: reference.calendarId, text: 'Lunch tomorrow' },
        createEvent: { calendarId: reference.calendarId, title: 'Meeting', startDateTime: start },
        listEvents: { calendarId: reference.calendarId },
        updateEvent: { ...reference, title: 'Updated' },
        deleteEvent: reference,
        findFreeBusyPeriods: {
          calendarIds: [reference.calendarId],
          startDate: start,
          endDate: end,
        },
        getEvent: reference,
      };

      const controller = new AbortController();
      const { calendar, req } = await fixture(controller.signal);
      const error = new Error('Provider unavailable');
      transport.mockRejectedValueOnce(error);

      await expect(calendar[slug]({ input: inputs[slug] as never, req })).rejects.toBe(error);
      expect(lastCall().signal).toBe(controller.signal);

      controller.abort(new Error('Caller cancelled'));
      transport.mockClear();

      await expect(calendar[slug]({ input: inputs[slug] as never, req })).rejects.toThrow(
        'Caller cancelled',
      );
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it('propagates calendar and color option lookup failures', async () => {
    const { client, req } = await fixture();
    const error = new Error('Options unavailable');

    for (const load of [calendars(), colors]) {
      transport.mockRejectedValueOnce(error);

      await expect(load({ client, req })).rejects.toBe(error);
    }
  });
});

describe('Google Calendar custom API', () => {
  it('sends JSON, raw, and multipart bodies with provider authentication', async () => {
    const { calendar, req } = await fixture();

    await calendar.customApiCall({
      input: {
        method: 'POST',
        path: '/calendars/primary/events',
        query: { eventTypes: ['default', 'focusTime'], count: 3 },
        headers: { 'X-Test': 'value' },
        body: { summary: 'Meeting' },
      },
      req,
    });

    const [url, init] = lastFetch();

    expect(String(url)).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?eventTypes=default&eventTypes=focusTime&count=3',
    );
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"summary":"Meeting"}',
      redirect: 'manual',
    });

    const headers = new Headers(init.headers);

    expect(headers.get('authorization')).toBe(`Bearer ${auth.accessToken}`);
    expect(headers.get('x-test')).toBe('value');
    expect(headers.get('content-type')).toBe('application/json');

    await calendar.customApiCall({
      input: { method: 'POST', path: '/custom', bodyType: 'raw', body: 'hello' },
      req,
    });

    expect(lastFetch()[1].body).toBe('hello');

    await calendar.customApiCall({
      input: { method: 'POST', path: '/custom', bodyType: 'formData', body: { title: 'Agenda' } },
      req,
    });

    const form = lastFetch()[1].body as FormData;

    expect(form).toBeInstanceOf(FormData);
    expect(form.get('title')).toBe('Agenda');
    expect(transport).not.toHaveBeenCalled();
  });

  it('returns the shared envelope, keeps failsafe errors, and refuses redirects', async () => {
    const { calendar, req } = await fixture();

    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/users/me/calendarList' }, req }),
    ).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    });

    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'Denied' } }, { status: 403 }),
    );

    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom', failsafe: true }, req }),
    ).resolves.toMatchObject({ status: 403, body: { error: { message: 'Denied' } } });

    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'Denied' } }, { status: 403 }),
    );

    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom' }, req }),
    ).rejects.toThrow('[frogbot] Google Calendar API request failed (403)');

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://attacker.test/steal' } }),
    );

    fetchMock.mockClear();

    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom' }, req }),
    ).rejects.toThrow('Google Calendar API redirected (302) to https://attacker.test/steal.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://attacker.test/calendar/v3/events',
    '//attacker.test/events',
    '/../../oauth2/v3/userinfo',
    '/%2e%2e/%2e%2e/oauth2/v3/userinfo',
    '/\\attacker.test',
    '/events#fragment',
  ])('rejects unsafe path %s before fetch', async (path) => {
    const { calendar, req } = await fixture();

    await expect(calendar.customApiCall({ input: { method: 'GET', path }, req })).rejects.toThrow(
      'Google Calendar',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { headers: { Authorization: 'Bearer override' } },
    { headers: { Host: 'attacker.test' } },
    { timeoutSeconds: 0 },
    { method: 'POST', bodyType: 'raw', body: {} },
    { body: 'invalid GET body' },
  ])('rejects invalid custom request %j', async (invalid) => {
    const { calendar, req } = await fixture();

    await expect(
      calendar.customApiCall({
        input: { method: 'GET', path: '/custom', ...invalid } as never,
        req,
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes cancellation to custom requests and propagates network failures', async () => {
    const controller = new AbortController();
    const { calendar, req } = await fixture(controller.signal);
    fetchMock.mockRejectedValueOnce(new Error('Network unavailable'));

    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom', failsafe: true }, req }),
    ).rejects.toThrow('Network unavailable');
    expect(lastFetch()[1].signal).toBeInstanceOf(AbortSignal);

    controller.abort(new Error('Cancelled'));
    fetchMock.mockClear();

    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom' }, req }),
    ).rejects.toThrow('Cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
