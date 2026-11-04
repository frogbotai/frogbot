import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-microsoft',
  () => import('../../../packages/pieces/piece-microsoft/src/index.js'),
);

import { createMicrosoftOutlook } from '../../../packages/pieces/piece-microsoft-outlook/src/index.js';
import { calls, json, req, stubGraph } from './fixtures.js';

const graph = 'https://graph.microsoft.com/v1.0';
const outlook = createMicrosoftOutlook({});

function pages(next: string) {
  return (call: { url: string }) =>
    call.url === next
      ? json({ value: [{ id: 'second' }] })
      : json({ value: [{ id: 'first' }], '@odata.nextLink': next });
}

function query(index = 0) {
  return Object.fromEntries(new URL(calls[index].url).searchParams);
}

afterEach(() => vi.unstubAllGlobals());

describe('Outlook list actions', () => {
  it('pages mail folders: nextLink becomes nextCursor, and null on the last page', async () => {
    const next = `${graph}/me/mailFolders?%24top=2&%24skip=2`;

    stubGraph(pages(next));

    const first = await outlook.listMailFolders({ input: { limit: 2 }, req: req() });

    expect(calls[0]?.url).toBe(`${graph}/me/mailFolders?%24top=2`);
    expect(first).toEqual({
      data: [{ id: 'first' }],
      pagination: { count: 1, hasMore: true, nextCursor: next, limit: 2 },
    });

    const last = await outlook.listMailFolders({
      input: { limit: 2, cursor: first.pagination.nextCursor! },
      req: req(),
    });

    expect(calls[1]?.url).toBe(next);
    expect(last.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 2 });
  });

  it('lists child folders of a parent folder', async () => {
    stubGraph(() => json({ value: [] }));

    await outlook.listMailFolders({ input: { parentFolderId: 'f/1' }, req: req() });

    expect(new URL(calls[0].url).pathname).toBe('/v1.0/me/mailFolders/f%2F1/childFolders');
    expect(query()).toEqual({ $top: '50' });
  });

  it('refuses a cursor that is not on the configured Graph origin', async () => {
    stubGraph(() => json({ value: [] }));

    for (const cursor of [
      'https://evil.test/v1.0/me/messages',
      'https://graph.microsoft.us/v1.0/me/messages',
      'http://graph.microsoft.com/v1.0/me/messages',
    ]) {
      await expect(outlook.listEmails({ input: { cursor }, req: req() })).rejects.toThrow(
        'must stay within the configured cloud',
      );
    }

    expect(calls).toHaveLength(0);
  });

  it('lists emails in a folder, newest first, received after a time', async () => {
    stubGraph(() =>
      json({
        value: [
          {
            id: 'm1',
            subject: 'Hi',
            conversationId: 'c1',
            body: { contentType: 'html', content: '<p>Hi</p>' },
            toRecipients: [{ emailAddress: { address: 'sales@acme.com' } }],
          },
        ],
      }),
    );

    const result = await outlook.listEmails({
      input: { folderId: 'sentitems', receivedAfter: '2026-11-01T00:00:00+02:00', limit: 10 },
      req: req(),
    });

    expect(new URL(calls[0].url).pathname).toBe('/v1.0/me/mailFolders/sentitems/messages');
    expect(query()).toEqual({
      $orderby: 'receivedDateTime desc',
      $filter: 'receivedDateTime ge 2026-10-31T22:00:00.000Z',
      $top: '10',
    });
    expect(result.data[0]).toMatchObject({ id: 'm1', conversationId: 'c1' });
  });

  it('lists the inbox by default', async () => {
    stubGraph(() => json({ value: [] }));

    await outlook.listEmails({ input: {}, req: req() });

    expect(new URL(calls[0].url).pathname).toBe('/v1.0/me/mailFolders/inbox/messages');
    expect(query()).toEqual({ $orderby: 'receivedDateTime desc', $top: '50' });
  });

  it('lists events with calendarView between start and end, in UTC', async () => {
    stubGraph(() =>
      json({
        value: [
          {
            id: 'occurrence-1',
            type: 'occurrence',
            seriesMasterId: 'series',
            start: { dateTime: '2026-11-04T15:00:00.0000000', timeZone: 'UTC' },
          },
        ],
      }),
    );

    const result = await outlook.listEvents({
      input: { calendarId: 'c1', start: '2026-11-01T00:00:00Z', end: '2026-12-01T00:00:00Z' },
      req: req(),
    });

    expect(new URL(calls[0].url).pathname).toBe('/v1.0/me/calendars/c1/calendarView');
    expect(query()).toEqual({
      startDateTime: '2026-11-01T00:00:00.000Z',
      endDateTime: '2026-12-01T00:00:00.000Z',
      $orderby: 'start/dateTime',
      $top: '50',
    });
    expect(calls[0]?.headers.get('prefer')).toBe('outlook.timezone="UTC"');
    expect(result.data[0]).toMatchObject({ id: 'occurrence-1', seriesMasterId: 'series' });
  });

  it('uses the main calendar when none is given', async () => {
    stubGraph(() => json({ value: [] }));

    await outlook.listEvents({
      input: { start: '2026-11-01T00:00:00Z', end: '2026-12-01T00:00:00Z' },
      req: req(),
    });

    expect(new URL(calls[0].url).pathname).toBe('/v1.0/me/calendar/calendarView');
  });

  it('pages contacts', async () => {
    const next = `${graph}/me/contacts?%24skiptoken=x`;

    stubGraph(pages(next));

    const first = await outlook.listContacts({ input: { limit: 1 }, req: req() });

    expect(calls[0]?.url).toBe(`${graph}/me/contacts?%24top=1`);
    expect(first.pagination).toEqual({ count: 1, hasMore: true, nextCursor: next, limit: 1 });
  });

  it('bounds limit to 1–100', async () => {
    await expect(outlook.listContacts({ input: { limit: 101 }, req: req() })).rejects.toThrow();
    await expect(outlook.listContacts({ input: { limit: 0 }, req: req() })).rejects.toThrow();
  });
});
