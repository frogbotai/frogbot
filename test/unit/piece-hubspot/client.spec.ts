import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createHubSpot, HubSpotError } from '../../../packages/pieces/piece-hubspot/src/index.js';
import { api, body, calls, json, req, stubHubSpot } from './fixtures.js';

const hubspot = createHubSpot({});
const item = z.object({ id: z.string() });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HubSpot client', () => {
  it('sends the bearer token and JSON, and refuses redirects', async () => {
    stubHubSpot(() => json({ id: '1', extra: true }, 201));

    const client = await hubspot.client({ req: req() });
    const result = await client.request(item, {
      method: 'POST',
      path: '/crm/v3/objects/contacts',
      body: { properties: { email: 'dana@acme.com' } },
    });

    expect(result).toEqual({ id: '1' });
    expect(calls[0]).toMatchObject({ url: `${api}/crm/v3/objects/contacts`, method: 'POST' });
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer hubspot-token');
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(body(calls[0])).toEqual({ properties: { email: 'dana@acme.com' } });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('joins array query values with commas and skips empty ones', async () => {
    stubHubSpot(() => json({ id: '1' }));

    const client = await hubspot.client({ req: req() });

    await client.request(item, {
      path: '/crm/v3/objects/deals',
      query: { properties: ['dealname', 'amount'], associations: [], after: undefined },
    });

    expect(calls[0]?.url).toBe(`${api}/crm/v3/objects/deals?properties=dealname%2Camount`);
  });

  it("throws HubSpot's message and category with the status", async () => {
    stubHubSpot(() =>
      json(
        {
          status: 'error',
          message: 'Property values were not valid',
          correlationId: 'c-1',
          category: 'VALIDATION_ERROR',
        },
        400,
      ),
    );

    const client = await hubspot.client({ req: req() });
    const error = await client
      .request(item, { path: '/crm/v3/objects/contacts/9' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HubSpotError);
    expect(error).toMatchObject({
      status: 400,
      category: 'VALIDATION_ERROR',
      message: 'HubSpot request failed (400 VALIDATION_ERROR): Property values were not valid',
    });
  });

  it('keeps a body that is not HubSpot JSON', async () => {
    stubHubSpot(() => new Response('Bad gateway', { status: 502 }));

    const client = await hubspot.client({ req: req() });

    await expect(client.request(item, { path: '/crm/v3/owners' })).rejects.toMatchObject({
      status: 502,
      category: undefined,
      message: 'HubSpot request failed (502): Bad gateway',
    });
  });

  it('waits Retry-After seconds on a 429, then succeeds', async () => {
    vi.useFakeTimers();

    let attempt = 0;

    stubHubSpot(() =>
      ++attempt === 1 ? json({}, 429, { 'retry-after': '2' }) : json({ id: '1' }),
    );

    const client = await hubspot.client({ req: req() });
    const pending = client.request(item, { path: '/crm/v3/owners' });

    await vi.advanceTimersByTimeAsync(1999);

    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ id: '1' });
    expect(calls).toHaveLength(2);
  });

  it('waits 10 seconds when a 429 has no Retry-After', async () => {
    vi.useFakeTimers();

    let attempt = 0;

    stubHubSpot(() => (++attempt === 1 ? json({}, 429) : json({ id: '1' })));

    const client = await hubspot.client({ req: req() });
    const pending = client.request(item, { path: '/crm/v3/owners' });

    await vi.advanceTimersByTimeAsync(9999);

    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ id: '1' });
  });

  it('throws the fourth 429 with its category', async () => {
    stubHubSpot(() =>
      json(
        {
          status: 'error',
          message: 'You have reached your secondly limit.',
          category: 'RATE_LIMITS',
        },
        429,
        { 'retry-after': '0' },
      ),
    );

    const client = await hubspot.client({ req: req() });
    const error = await client
      .request(item, { path: '/crm/v3/owners' })
      .catch((caught: unknown) => caught);

    expect(calls).toHaveLength(4);
    expect(error).toMatchObject({
      status: 429,
      category: 'RATE_LIMITS',
      message: 'HubSpot request failed (429 RATE_LIMITS): You have reached your secondly limit.',
    });
  });

  it('stops waiting when the request aborts', async () => {
    stubHubSpot(() => json({}, 429, { 'retry-after': '60' }));

    const controller = new AbortController();
    const client = await hubspot.client({ req: req() });
    const pending = client.request(item, { path: '/crm/v3/owners', signal: controller.signal });

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    controller.abort(new Error('Stopped.'));

    await expect(pending).rejects.toThrow('Stopped.');
    expect(calls).toHaveLength(1);
  });

  it("stops a read when the caller's request aborts", async () => {
    stubHubSpot(() => json({ results: [] }));

    const controller = new AbortController();

    controller.abort(new Error('Gone.'));

    await expect(
      hubspot.listOwners({ input: {}, req: req({ signal: controller.signal }) }),
    ).rejects.toThrow('Gone.');
    expect(calls).toHaveLength(0);
  });
});
