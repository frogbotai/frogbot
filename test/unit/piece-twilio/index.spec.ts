import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createTwilioClient } from '../../../packages/pieces/piece-twilio/src/client.js';
import {
  createTwilio,
  twilioActions,
  twilioTriggers,
} from '../../../packages/pieces/piece-twilio/src/index.js';

const auth = { username: 'AC_test', password: 'token' };
const req = {
  frogbot: {
    config: { files: { slug: 'files' } },
    connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    create: vi.fn().mockResolvedValue({ id: 'file-1', url: '/files/RE1.wav' }),
  },
  user: null,
} as never;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('twilio', () => {
  it('exposes every semantic action and trigger', () => {
    const piece = createTwilio({ auth });

    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      twilioActions.map((slug) => `twilio_${slug}`),
    );
    expect(Object.keys(piece.triggers)).toEqual(twilioTriggers);
  });

  it('sends form requests with Account SID basic auth and parses action output', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ sid: 'SM1', status: 'queued' }));

    vi.stubGlobal('fetch', fetch);

    const result = await createTwilio({ auth }).sendSms({
      input: { from: '+15550001', to: '+15550002', body: 'Hello' },
      req,
    });
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];

    expect(url.pathname).toBe('/2010-04-01/Accounts/AC_test/Messages.json');
    expect(new Headers(init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('AC_test:token').toString('base64')}`,
    );
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      From: '+15550001',
      To: '+15550002',
      Body: 'Hello',
    });
    expect(result).toEqual({ sid: 'SM1', status: 'queued' });
  });

  it('requires the exact basic-auth credential shape', () => {
    expect(() =>
      createTwilioClient({
        auth: { accountSid: 'AC_test', authToken: 'token' },
        options: {},
      }),
    ).toThrow();
  });

  it('maps lookup, call, message, and custom requests exactly', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => json({ sid: 'CA1', phone_number: '+15550002' }));

    vi.stubGlobal('fetch', fetch);

    const piece = createTwilio({ auth });

    await piece.lookupPhoneNumber({ input: { phoneNumber: '+1 555' }, req });
    await piece.makeCall({
      input: {
        from: '+15550001',
        to: '+15550002',
        message: '<Hello & goodbye>',
        voice: 'alice',
        timeout: 30,
      },
      req,
    });
    await piece.getMessage({ input: { messageSid: 'SM/1' }, req });
    await piece.customApiCall({
      input: { method: 'POST', path: '/2010-04-01/test.json', body: { Value: 3 } },
      req,
    });

    expect((fetch.mock.calls[0]?.[0] as URL).href).toBe(
      'https://lookups.twilio.com/v2/PhoneNumbers/%2B1%20555?Fields=line_type_intelligence',
    );
    expect(String((fetch.mock.calls[1]?.[1]?.body as URLSearchParams).get('Twiml'))).toBe(
      '<Response><Say voice="alice">&lt;Hello &amp; goodbye&gt;</Say></Response>',
    );
    expect((fetch.mock.calls[1]?.[1]?.body as URLSearchParams).get('Timeout')).toBe('30');
    expect((fetch.mock.calls[2]?.[0] as URL).pathname).toContain('/Messages/SM%2F1.json');
    expect(Object.fromEntries(fetch.mock.calls[3]?.[1]?.body as URLSearchParams)).toEqual({
      Value: '3',
    });
  });

  it('rejects custom-call paths that could receive Twilio credentials', async () => {
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);

    await expect(
      createTwilio({ auth }).customApiCall({
        input: { method: 'GET', path: '//attacker.example/collect' },
        req,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('persists recording bytes through the FrogBot files API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));

    const result = await createTwilio({ auth }).downloadRecording({
      input: { recordingSid: 'RE1', format: 'wav', channels: 2 },
      req,
    });

    expect(result).toEqual({
      id: 'file-1',
      name: 'RE1.wav',
      mimeType: 'audio/wav',
      url: '/files/RE1.wav',
    });
    expect(req.frogbot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        file: expect.objectContaining({ name: 'RE1.wav', mimetype: 'audio/wav', size: 3 }),
        overrideAccess: false,
        req,
      }),
    );
  });

  it('loads Twilio sender phone number options', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          incoming_phone_numbers: [{ friendly_name: 'Support', phone_number: '+15550001' }],
        }),
      ),
    );

    const piece = createTwilio({ auth });
    const definition = pieceActionDefinition(piece.sendSms)!;
    const client = await piece.client({ req });

    await expect(
      definition.options?.from?.({ input: {}, client, options: {}, req }),
    ).resolves.toEqual([{ label: 'Support', value: '+15550001' }]);
  });

  it('keeps Twilio API errors useful', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Invalid number' }, 400)));

    await expect(
      createTwilio({ auth }).getMessage({ input: { messageSid: 'bad' }, req }),
    ).rejects.toThrow('Twilio request failed (400): Invalid number');
  });

  it('filters polling results and advances a stable cursor', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        calls: [
          { sid: 'CA2', status: 'completed', date_created: '2026-01-02T00:00:00Z' },
          { sid: 'CA1', status: 'failed', date_created: '2026-01-03T00:00:00Z' },
        ],
      }),
    );

    vi.stubGlobal('fetch', fetch);

    const piece = createTwilio({ auth });
    const definition = piece.triggers.callCompleted;
    const result = await definition.run({
      client: createTwilioClient({ auth, options: {} }),
      cursor: { date: new Date('2026-01-01T00:00:00Z').getTime(), sid: 'CA0' },
      input: {},
      options: {},
      req,
    } as never);

    expect(result.events).toEqual([
      { sid: 'CA2', status: 'completed', date_created: '2026-01-02T00:00:00Z' },
    ]);
    expect(result.cursor).toEqual({
      date: new Date('2026-01-02T00:00:00Z').getTime(),
      sid: 'CA2',
    });
  });

  it('establishes a polling baseline and orders timestamp ties by SID', async () => {
    const date = '2026-01-02T00:00:00Z';
    const fetch = vi.fn().mockImplementation(async () =>
      json({
        calls: [
          { sid: 'CA2', status: 'completed', date_created: date },
          { sid: 'CA1', status: 'completed', date_created: date },
        ],
      }),
    );

    vi.stubGlobal('fetch', fetch);

    const definition = createTwilio({ auth }).triggers.callCompleted;
    const client = createTwilioClient({ auth, options: {} });
    const baseline = await definition.run({ client, input: {}, options: {}, req } as never);

    expect(baseline).toEqual({
      events: [],
      cursor: { date: Date.parse(date), sid: 'CA2' },
    });

    const tied = await definition.run({
      client,
      cursor: { date: Date.parse(date), sid: 'CA1' },
      input: {},
      options: {},
      req,
    } as never);

    expect(tied.events).toEqual([{ sid: 'CA2', status: 'completed', date_created: date }]);
  });
});
