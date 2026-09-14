import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createZoom,
  zoomActions,
  zoomScopes,
} from '../../../packages/pieces/piece-zoom/src/index.js';

const storedAuth = { accessToken: 'stored-access', refreshToken: 'stored-refresh' };
const credentialKey = {};
const req = {
  signal: undefined,
  user: null,
  frogbot: {
    connections: {
      resolvePieceCredential: vi.fn().mockResolvedValue({ auth: storedAuth, key: credentialKey }),
    },
  },
} as never;

const meeting = {
  id: 123,
  start_time: '2026-09-13T12:00:00Z',
  start_url: 'https://zoom.us/start',
  join_url: 'https://zoom.us/j/123',
  timezone: 'UTC',
  topic: 'FrogBot',
  type: 2,
  settings: {
    approval_type: 2,
    audio: 'telephony',
    auto_recording: 'none',
    host_video: true,
    join_before_host: false,
    mute_upon_entry: false,
    participant_video: false,
    waiting_room: true,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('zoom', () => {
  it('declares all native actions and maps stored OAuth tokens', () => {
    const zoom = createZoom({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const oauth = pieceFactoryDefinition(createZoom).oauth;

    expect(pieceInstanceTools(zoom)?.map(({ slug }) => slug)).toEqual(
      zoomActions.map((slug) => `zoom_${slug}`),
    );
    expect(oauth).toMatchObject({
      authorizationUrl: 'https://zoom.us/oauth/authorize',
      tokenUrl: 'https://zoom.us/oauth/token',
      tokenEndpointAuthMethod: 'client_secret_basic',
      scopes: zoomScopes,
    });
    expect(
      oauth?.toAuth?.({
        tokens: { access_token: 'stored-access', refresh_token: 'stored-refresh' },
      }),
    ).toEqual(storedAuth);
    expect(() => oauth?.toAuth?.({ tokens: { refresh_token: 'stored-refresh' } })).toThrow(
      'Zoom OAuth response did not include an access token.',
    );
  });

  it('uses the stored token and exact meeting request transport', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(meeting, { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const zoom = createZoom();

    await expect(zoom.createMeeting({ input: { topic: 'FrogBot' }, req })).resolves.toEqual(
      meeting,
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.zoom.us/v2/users/me/meetings'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer stored-access' }),
        redirect: 'error',
      }),
    );
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body);

    expect(body).toMatchObject({
      topic: 'FrogBot',
      agenda: 'My Meeting',
      duration: 30,
      timezone: 'UTC',
      type: 2,
      settings: { approval_type: 2, audio: 'telephony', host_video: true },
    });
  });

  it('paginates every scheduled meeting option page', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ meetings: [{ id: 1, topic: 'First' }], next_page_token: 'next' }),
      )
      .mockResolvedValueOnce(
        Response.json({ meetings: [{ id: 2, topic: '' }], next_page_token: '' }),
      );
    vi.stubGlobal('fetch', fetch);
    const zoom = createZoom({ auth: storedAuth });
    const client = await zoom.client({ req });
    const action = pieceFactoryDefinition(createZoom).actions?.find(
      ({ slug }) => slug === 'getMeeting',
    );
    const options = await action?.options?.meeting_id?.({ client } as never);

    expect(options).toEqual({
      options: [
        { label: 'First', value: '1' },
        { label: 'Meeting 2', value: '2' },
      ],
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain('page_size=300');
    expect(String(fetch.mock.calls[1]?.[0])).toContain('next_page_token=next');
  });

  it('maps registrant, get, and update actions with validated responses', async () => {
    const registrant = {
      id: 123,
      join_url: 'https://zoom.us/j/123',
      registrant_id: 'registrant',
      start_time: '2026-09-13T12:00:00Z',
      topic: 'FrogBot',
      occurrences: [],
      participant_pin_code: 1234,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(registrant, { status: 201 }))
      .mockResolvedValueOnce(Response.json(meeting))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const zoom = createZoom({ auth: storedAuth });

    await expect(
      zoom.createMeetingRegistrant({
        input: {
          meeting_id: '123',
          first_name: 'Ada',
          email: 'ada@example.com',
          custom_questions: { Company: 'FrogBot' },
        },
        req,
      }),
    ).resolves.toEqual(registrant);
    await expect(
      zoom.getMeeting({ input: { meeting_id: '123', show_previous_occurrences: true }, req }),
    ).resolves.toEqual(meeting);
    await expect(
      zoom.updateMeeting({ input: { meeting_id: '123', waiting_room: false }, req }),
    ).resolves.toEqual({ success: true, message: 'Meeting updated successfully' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body).custom_questions).toEqual([
      { title: 'Company', value: 'FrogBot' },
    ]);
    expect(String(fetch.mock.calls[1]?.[0])).toContain('show_previous_occurrences=true');
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body)).toEqual({
      settings: { waiting_room: false },
    });
  });

  it('locks custom calls to Zoom and prevents authorization overrides', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const zoom = createZoom({ auth: storedAuth });

    await expect(
      zoom.customApiCall({
        input: {
          method: 'POST',
          path: '/meetings/123',
          headers: { Authorization: 'Bearer attacker', 'x-test': 'safe' },
          query: { occurrence_id: 'one' },
          body: { topic: 'Safe' },
        },
        req,
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.zoom.us/v2/meetings/123?occurrence_id=one'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer stored-access',
          'x-test': 'safe',
        }),
      }),
    );
    await expect(
      zoom.customApiCall({ input: { path: '//evil.example/steal' }, req }),
    ).rejects.toThrow('must be relative');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('looks up the native Zoom account and preserves API errors', async () => {
    const zoom = createZoom({ auth: storedAuth });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ id: 'zoom-user', email: 'user@example.com', display_name: 'Zoom User' }),
        ),
    );
    const client = await zoom.client({ req });

    await expect(
      pieceFactoryDefinition(createZoom).oauth?.account?.({
        tokens: { access_token: 'stored-access' },
        client,
        req,
      } as never),
    ).resolves.toEqual({ id: 'zoom-user', label: 'Zoom User', email: 'user@example.com' });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 300, message: 'Invalid meeting' }, { status: 404 }),
        ),
    );
    const failed = createZoom({ auth: { accessToken: 'other' } });

    await expect(
      failed.getMeeting({ input: { meeting_id: 'missing' }, req }),
    ).rejects.toMatchObject({ name: 'ZoomRequestError', status: 404 });
  });
});
