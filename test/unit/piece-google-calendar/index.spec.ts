import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
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

const transport = vi.fn(async (config: TransportConfig) => {
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
});

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
  vi.spyOn(Object.getPrototypeOf(oauth.transporter), 'request').mockImplementation(transport);
});

afterEach(() => vi.restoreAllMocks());

describe('native Google Calendar', () => {
  it('declares nine semantic actions, meaningful schemas, shared identity, and secret credentials', async () => {
    const piece = createGoogleCalendar({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    expect(pieceInstanceTools(piece)?.map((action) => action.slug)).toEqual(
      googleCalendarActions.map((slug) => `google-calendar_${slug}`),
    );
    expect(Object.keys(piece.triggers)).toEqual([]);
    const definition = pieceFactoryDefinition(createGoogleCalendar);
    expect(definition.oauth?.account).toBe(googleOAuth.account);
    expect(definition.oauth?.scopes).toEqual([...googleOAuth.scopes, ...googleCalendarScopes]);
    expect(
      definition.oauth?.toAuth?.({ tokens: { access_token: 'access', refresh_token: 'refresh' } }),
    ).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(definition.oauth?.toAuth?.({ tokens: { access_token: 'access' } })).toEqual({
      accessToken: 'access',
      refreshToken: undefined,
    });
    expect(z.toJSONSchema(definition.auth)).toMatchObject({
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
    transport.mockImplementationOnce(async (config) => response({}, config));
    expect(await calendars()({ client, req })).toEqual([]);
    transport.mockImplementationOnce(async (config) => response({}, config));
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
    transport.mockImplementationOnce(async (config) => {
      next.abort(new Error('Cancelled after read'));
      return response(existing, config);
    });
    await expect(
      second.calendar.addAttendees({
        input: { ...reference, attendees: ['new@example.com'] },
        req: second.req,
      }),
    ).rejects.toThrow('Cancelled after read');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(googleCalendarActions)(
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
        customApiCall: { method: 'GET', path: '/custom' },
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
  it('serializes JSON and multipart files through the SDK HTTP adapter', async () => {
    vi.restoreAllMocks();
    const { calendar, client, req } = await fixture();
    const oauth = client.context._options.auth as InstanceType<typeof google.auth.OAuth2>;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ ok: true }));
    oauth.transporter.defaults.fetchImplementation = fetchMock;
    await calendar.customApiCall({
      input: { method: 'POST', path: '/custom', body: { summary: 'Meeting' } },
      req,
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: '{"summary":"Meeting"}',
      redirect: 'manual',
    });
    await calendar.customApiCall({
      input: {
        method: 'POST',
        path: '/custom',
        bodyType: 'formData',
        formData: [{ name: 'file', type: 'file', filename: 'file.bin', base64: 'AP+A' }],
      },
      req,
    });
    const form = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(new Uint8Array(await (form.get('file') as File).arrayBuffer())).toEqual(
      new Uint8Array([0, 255, 128]),
    );
    for (const body of ['text', false, 0, null]) {
      await calendar.customApiCall({ input: { method: 'POST', path: '/custom', body }, req });
      expect(fetchMock.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify(body));
    }
  });

  it('rejects redirects at the real HTTP adapter without a second request', async () => {
    vi.restoreAllMocks();
    const { calendar, client, req } = await fixture();
    const oauth = client.context._options.auth as InstanceType<typeof google.auth.OAuth2>;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://attacker.test/steal' },
        }),
    );
    oauth.transporter.defaults.fetchImplementation = fetchMock;
    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom', failsafe: true }, req }),
    ).rejects.toThrow('redirects are not allowed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://www.googleapis.com/calendar/v3/custom');
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${auth.accessToken}`);
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const)(
    'supports %s with provider authentication',
    async (method) => {
      const { calendar, req } = await fixture();
      await calendar.customApiCall({
        input: {
          method,
          path: '/custom',
          query: { eventTypes: ['default', 'focusTime'], count: 3 },
          headers: { 'X-Test': 'value' },
        },
        req,
      });
      expect(lastCall()).toMatchObject({
        url: 'https://www.googleapis.com/calendar/v3/custom',
        method,
        params: { eventTypes: ['default', 'focusTime'], count: 3 },
        redirect: 'manual',
        maxRedirects: 0,
        retry: false,
      });
      expect(lastCall().headers?.get('authorization')).toBe(`Bearer ${auth.accessToken}`);
      expect(lastCall().headers?.get('x-test')).toBe('value');
    },
  );

  it('supports full provider URLs, JSON, raw, no body, timeout, and multipart binary files', async () => {
    const { calendar, req } = await fixture();
    await calendar.customApiCall({
      input: {
        method: 'POST',
        path: 'https://www.googleapis.com/calendar/v3/custom',
        body: { title: 'JSON' },
        timeout: 5,
      },
      req,
    });
    expect(lastCall()).toMatchObject({ data: '{"title":"JSON"}', timeout: 5000 });
    expect(lastCall().headers?.get('content-type')).toBe('application/json');
    await calendar.customApiCall({
      input: { method: 'POST', path: '/custom', bodyType: 'raw', body: 'hello' },
      req,
    });
    expect(lastCall().data).toBe('hello');
    expect(lastCall().headers?.get('content-type')).toBe('text/plain');
    await calendar.customApiCall({
      input: { method: 'POST', path: '/custom', bodyType: 'none', body: 'ignored' },
      req,
    });
    expect(lastCall().data).toBeUndefined();
    await calendar.customApiCall({
      input: {
        method: 'POST',
        path: '/custom',
        bodyType: 'formData',
        headers: { 'Content-Type': 'wrong' },
        formData: [
          { name: 'title', type: 'text', value: '' },
          {
            name: 'file',
            type: 'file',
            filename: 'event.ics',
            contentType: 'text/calendar',
            base64: Buffer.from('calendar content').toString('base64'),
          },
        ],
      },
      req,
    });
    const form = lastCall().data as FormData;
    expect(form.get('title')).toBe('');
    const file = form.get('file') as File;
    expect(file.name).toBe('event.ics');
    expect(file.type).toBe('text/calendar');
    expect(await file.text()).toBe('calendar content');
    expect(lastCall().headers?.has('content-type')).toBe(false);
  });

  it('returns binary bytes as base64 and supports failsafe HTTP responses', async () => {
    const { calendar, req } = await fixture();
    transport.mockImplementationOnce(async (config) => ({
      ...response(Buffer.from([0, 255, 128]), config),
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
    }));
    await expect(
      calendar.customApiCall({
        input: { method: 'GET', path: '/custom', responseIsBinary: true },
        req,
      }),
    ).resolves.toMatchObject({ body: { base64: 'AP+A', contentType: 'application/octet-stream' } });
    expect(lastCall().responseType).toBe('arraybuffer');
    transport.mockImplementationOnce(async (config) =>
      response({ error: { message: 'Denied' } }, config, 403),
    );
    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom', failsafe: true }, req }),
    ).resolves.toMatchObject({ status: 403, body: { error: { message: 'Denied' } } });
    expect(lastCall().validateStatus?.(403)).toBe(true);
    await calendar.customApiCall({ input: { method: 'GET', path: '/custom' }, req });
    expect(lastCall().validateStatus?.(403)).toBe(false);
  });

  it.each([
    'https://attacker.test/calendar/v3/events',
    '//attacker.test/events',
    '/../../oauth2/v3/userinfo',
    '/%2e%2e/%2e%2e/oauth2/v3/userinfo',
    '/%252e%252e/other',
    '/%2e%2e%2fother',
    '/\\attacker.test',
    'https://www.googleapis.com.attacker.test/calendar/v3/events',
    'https://attacker@www.googleapis.com/calendar/v3/events',
    'https://www.googleapis.com/oauth2/v3/userinfo',
    'http://www.googleapis.com/calendar/v3/events',
    'https://www.googleapis.com:444/calendar/v3/events',
    '/events#fragment',
  ])('rejects unsafe URL %s before transport', async (path) => {
    const { calendar, req } = await fixture();
    await expect(calendar.customApiCall({ input: { method: 'GET', path }, req })).rejects.toThrow(
      'Google Calendar v3 API',
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { headers: { Authorization: 'Bearer override' } },
    { headers: { Host: 'attacker.test' } },
    { followRedirects: true },
    { timeout: 0 },
    { method: 'POST', bodyType: 'raw', body: {} },
    { method: 'POST', bodyType: 'formData' },
    { body: 'invalid GET body' },
    {
      method: 'POST',
      bodyType: 'formData',
      formData: [{ type: 'file', name: 'file', filename: 'file.bin', base64: 'not base64!' }],
    },
  ])('rejects invalid custom request %j', async (invalid) => {
    const { calendar, req } = await fixture();
    await expect(
      calendar.customApiCall({
        input: { method: 'GET', path: '/custom', ...invalid } as never,
        req,
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects redirect responses even in failsafe mode without forwarding credentials', async () => {
    const { calendar, req } = await fixture();
    transport.mockImplementationOnce(async (config) => ({
      ...response('', config, 302),
      headers: new Headers({ location: 'https://attacker.test/steal' }),
    }));
    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom', failsafe: true }, req }),
    ).rejects.toThrow('redirects are not allowed');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(lastCall().redirect).toBe('manual');
  });

  it('passes cancellation to custom requests and propagates transport failures', async () => {
    const controller = new AbortController();
    const { calendar, req } = await fixture(controller.signal);
    transport.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom', failsafe: true }, req }),
    ).rejects.toThrow('Network unavailable');
    expect(lastCall().signal).toBe(controller.signal);
    controller.abort(new Error('Cancelled'));
    transport.mockClear();
    await expect(
      calendar.customApiCall({ input: { method: 'GET', path: '/custom' }, req }),
    ).rejects.toThrow('Cancelled');
    expect(transport).not.toHaveBeenCalled();
  });
});
