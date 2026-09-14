import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createPagerduty,
  pagerdutyActions,
  pagerdutyTriggers,
} from '../../../packages/pieces/piece-pagerduty/src/index.js';

const auth = { apiKey: 'pd_test_key' };
const req = () =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('pagerduty', () => {
  it('exposes semantic actions and every upstream trigger', () => {
    const piece = createPagerduty({ auth });

    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      pagerdutyActions.map((slug) => `pagerduty_${slug}`),
    );
    expect(Object.keys(piece.triggers)).toEqual(pagerdutyTriggers);
  });

  it('creates incidents with PagerDuty auth and the full optional payload', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ incident: { id: 'P1', status: 'triggered' } }));
    vi.stubGlobal('fetch', fetch);

    const result = await createPagerduty({ auth }).createIncident({
      req: req(),
      input: {
        fromEmail: 'frog@example.com',
        serviceId: 'S1',
        title: 'Outage',
        details: 'Details',
        incidentKey: 'key',
        assigneeIds: ['U1'],
        priorityId: 'PR1',
        conferenceNumber: '555-0100',
        conferenceUrl: 'https://meet.example.com',
      },
    });

    expect(result).toEqual({ id: 'P1', status: 'triggered' });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.pagerduty.com/incidents'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Token token=pd_test_key',
          From: 'frog@example.com',
        }),
      }),
    );
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      incident: {
        type: 'incident',
        title: 'Outage',
        service: { id: 'S1', type: 'service_reference' },
        urgency: 'high',
        body: { type: 'incident_body', details: 'Details' },
        incident_key: 'key',
        assignments: [{ assignee: { id: 'U1', type: 'user_reference' } }],
        priority: { id: 'PR1', type: 'priority_reference' },
        conference_bridge: {
          conference_number: '555-0100',
          conference_url: 'https://meet.example.com',
        },
      },
    });
  });

  it('maps list filters, paging bounds, reads, and status updates', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ incidents: [{ id: 'P1' }], more: false }))
      .mockResolvedValueOnce(response({ incident: { id: 'P/1' } }))
      .mockResolvedValueOnce(response({ incident: { id: 'P1', status: 'acknowledged' } }))
      .mockResolvedValueOnce(response({ incident: { id: 'P1', status: 'resolved' } }));
    vi.stubGlobal('fetch', fetch);
    const piece = createPagerduty({ auth });

    await piece.listIncidents({
      req: req(),
      input: { statuses: ['triggered', 'resolved'], urgency: 'high', limit: 500, offset: -2 },
    });
    await piece.getIncident({ req: req(), input: { incidentId: 'P/1' } });
    await piece.acknowledgeIncident({
      req: req(),
      input: { incidentId: 'P1', fromEmail: 'frog@example.com' },
    });
    await piece.resolveIncident({
      req: req(),
      input: { incidentId: 'P1', fromEmail: 'frog@example.com', resolution: 'Fixed' },
    });

    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'https://api.pagerduty.com/incidents?statuses%5B%5D=triggered&statuses%5B%5D=resolved&urgencies%5B%5D=high&limit=100&offset=0',
    );
    expect(fetch.mock.calls[1]?.[0].toString()).toBe('https://api.pagerduty.com/incidents/P%2F1');
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body as string).incident.status).toBe(
      'acknowledged',
    );
    expect(JSON.parse(fetch.mock.calls[3]?.[1]?.body as string).incident).toEqual({
      type: 'incident',
      status: 'resolved',
      body: { type: 'incident_body', details: 'Fixed' },
    });
  });

  it('rejects malformed PagerDuty action responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ incident: { status: 'triggered' } })),
    );

    const piece = createPagerduty({ auth });

    await expect(
      piece.getIncident({
        req: req(),
        input: { incidentId: 'P1' },
      }),
    ).rejects.toThrow();
  });

  it('loads every page of service options', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ services: [{ id: 'S1', name: 'API' }], more: true }))
      .mockResolvedValueOnce(response({ services: [{ id: 'S2', name: 'Web' }], more: false }));
    vi.stubGlobal('fetch', fetch);
    const piece = createPagerduty({ auth });
    const client = await piece.client({ req: req() });
    const definition = pieceActionDefinition(piece.createIncident)!;

    await expect(
      definition.options?.serviceId?.({ input: {}, client, options: {}, req: req() }),
    ).resolves.toEqual([
      { label: 'API', value: 'S1' },
      { label: 'Web', value: 'S2' },
    ]);
    expect(fetch.mock.calls[1]?.[0].toString()).toContain('offset=100');
  });

  it('keeps custom calls on PagerDuty without caller-controlled headers', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ error: { message: 'Denied' } }, 403));
    vi.stubGlobal('fetch', fetch);
    const piece = createPagerduty({ auth });

    await expect(
      piece.customApiCall({
        req: req(),
        input: {
          method: 'POST',
          path: '/incidents',
          queryParams: { a: ['1', '2'] },
          body: { x: 1 },
        },
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Token token=pd_test_key',
    });
    await expect(
      piece.customApiCall({
        req: req(),
        input: { method: 'GET', path: '//example.com/collect', queryParams: {} },
      }),
    ).rejects.toThrow('Path must target the PagerDuty API.');
    await expect(piece.getIncident({ req: req(), input: { incidentId: 'P1' } })).rejects.toThrow(
      'Denied',
    );
  });

  it.each([
    ['newIncident', 'incident.triggered'],
    ['incidentResolved', 'incident.resolved'],
    ['incidentAcknowledged', 'incident.acknowledged'],
  ] as const)('models manual registration and filters %s deliveries', async (slug, eventType) => {
    const definition = pieceFactoryDefinition(createPagerduty).triggers?.find(
      (trigger) => trigger.slug === slug,
    );

    if (!definition || definition.type !== 'webhook') {
      throw new Error(`Missing webhook trigger '${slug}'.`);
    }

    const state = await definition.onEnable({
      client: {},
      input: {},
      options: {},
      req: req(),
      webhookUrl: 'https://example.com/pagerduty',
    } as never);
    const delivery = {
      event: { id: 'event-1', event_type: eventType, data: { id: 'incident-1' } },
    };
    const events = await definition.run({
      client: {},
      input: {},
      options: {},
      req: { data: delivery },
      state,
    } as never);

    expect(state).toEqual({ webhookUrl: 'https://example.com/pagerduty' });
    expect(events).toEqual([{ data: delivery, dedupeKey: 'event-1' }]);
    await expect(
      definition.run({
        client: {},
        input: {},
        options: {},
        req: { data: { event: { ...delivery.event, event_type: 'incident.other' } } },
        state,
      } as never),
    ).resolves.toEqual([]);
    await expect(
      definition.onDisable({
        client: {},
        input: {},
        options: {},
        req: req(),
        state,
      } as never),
    ).resolves.toBeUndefined();
  });

  it('verifies PagerDuty V3 signatures against the raw request body', async () => {
    const webhook = pieceFactoryDefinition(createPagerduty).webhook!;
    const body = Buffer.from('{"event":{"id":"event-1"}}');
    const signature = createHmac('sha256', 'secret').update(body).digest('hex');
    const request = (header: string | null, value = body) => ({
      headers: new Headers(header ? { 'x-pagerduty-signature': header } : {}),
      arrayBuffer: vi.fn().mockResolvedValue(value),
    });

    await expect(
      webhook.verify({
        req: request(`v2=ignored, v1=${signature}`) as never,
        options: { signingSecret: 'secret' },
      }),
    ).resolves.toBe(true);
    await expect(
      webhook.verify({
        req: request(`v1=${signature}`, Buffer.from('{}')) as never,
        options: { signingSecret: 'secret' },
      }),
    ).resolves.toBe(false);
    await expect(
      webhook.verify({
        req: request('v1=not-hex') as never,
        options: { signingSecret: 'secret' },
      }),
    ).resolves.toBe(false);
    await expect(
      webhook.verify({
        req: request(null) as never,
        options: {},
      }),
    ).resolves.toBe(false);
  });
});
