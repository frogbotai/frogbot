import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createZendeskClient } from '../../../packages/pieces/piece-zendesk/src/client.js';
import { createZendesk, ZendeskError } from '../../../packages/pieces/piece-zendesk/src/index.js';
import { api, auth, basic, calls, json, req, stubZendesk } from './fixtures.js';

const zendesk = createZendesk({});
const item = z.object({ id: z.number() });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Zendesk client', () => {
  it('sends the Basic token header to the account host', async () => {
    stubZendesk(() => json({ id: 1, extra: true }, 201));

    const client = await zendesk.client({ req: req() });
    const result = await client.data(item, {
      method: 'POST',
      path: '/api/v2/tickets',
      body: { ticket: { subject: 'A' } },
    });

    expect(result).toEqual({ id: 1 });
    expect(calls[0]).toMatchObject({ url: `${api}/tickets`, method: 'POST', redirect: 'error' });
    expect(calls[0]?.headers.get('authorization')).toBe(basic);
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(calls[0]?.body).toBe('{"ticket":{"subject":"A"}}');
  });

  it('returns {} for a 204', async () => {
    stubZendesk(() => new Response(null, { status: 204 }));

    const client = createZendeskClient({ auth });

    await expect(client.json({ method: 'DELETE', path: '/api/v2/users/1' })).resolves.toEqual({});
  });

  it.each(['acme.evil.com', 'acme/../x', '-acme', ''])('refuses the subdomain %j', (subdomain) => {
    expect(() => createZendeskClient({ auth: { ...auth, subdomain } })).toThrow();
  });

  it.each(['https://evil.com/api/v2/tickets', '//evil.com/api/v2/tickets'])(
    'throws before sending to %s',
    async (target) => {
      stubZendesk(() => json({}));

      const client = createZendeskClient({ auth });

      await expect(client.json({ path: target })).rejects.toThrow(
        'Path must target https://acme.zendesk.com.',
      );
      expect(calls).toHaveLength(0);
    },
  );

  it("throws Zendesk's error, description and details with the status", async () => {
    stubZendesk(() =>
      json(
        {
          error: 'RecordInvalid',
          description: 'Record validation errors',
          details: { email: [{ description: 'Email is invalid' }] },
        },
        422,
      ),
    );

    const client = createZendeskClient({ auth });
    const error = await client.json({ path: '/api/v2/users' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ZendeskError);
    expect(error).toMatchObject({
      status: 422,
      message:
        'Zendesk request failed (422): RecordInvalid; Record validation errors; email: Email is invalid',
    });
  });

  it('reads the webhooks API errors list', async () => {
    stubZendesk(() =>
      json({ errors: [{ code: 'InvalidEndpoint', title: 'Invalid', detail: 'Bad URL' }] }, 400),
    );

    const client = createZendeskClient({ auth });

    await expect(client.json({ path: '/api/v2/webhooks' })).rejects.toThrow(
      'Zendesk request failed (400): Invalid: Bad URL',
    );
  });

  it('waits Retry-After seconds on a 429, then succeeds', async () => {
    vi.useFakeTimers();

    let attempt = 0;

    stubZendesk(() => (++attempt === 1 ? json({}, 429, { 'retry-after': '2' }) : json({ id: 1 })));

    const client = createZendeskClient({ auth });
    const pending = client.data(item, { path: '/api/v2/tickets/1' });

    await vi.advanceTimersByTimeAsync(1999);

    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ id: 1 });
    expect(calls).toHaveLength(2);
  });

  it("throws the fourth 429 with Zendesk's message", async () => {
    stubZendesk(() =>
      json({ error: 'APIRateLimitExceeded', description: 'Rate limit exceeded' }, 429, {
        'retry-after': '0',
      }),
    );

    const client = createZendeskClient({ auth });
    const error = await client.json({ path: '/api/v2/groups' }).catch((caught: unknown) => caught);

    expect(calls).toHaveLength(4);
    expect(error).toMatchObject({
      status: 429,
      message: 'Zendesk request failed (429): APIRateLimitExceeded; Rate limit exceeded',
    });
  });

  it('stops waiting when the request aborts', async () => {
    stubZendesk(() => json({}, 429, { 'retry-after': '60' }));

    const controller = new AbortController();
    const client = createZendeskClient({ auth });
    const pending = client.json({ path: '/api/v2/groups', signal: controller.signal });

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    controller.abort(new Error('Stopped.'));

    await expect(pending).rejects.toThrow('Stopped.');
    expect(calls).toHaveLength(1);
  });

  it('returns a redirect unfollowed when asked to', async () => {
    stubZendesk(() => new Response(null, { status: 302, headers: { location: '/elsewhere' } }));

    const client = createZendeskClient({ auth });
    const response = await client.send({ path: '/attachments/token/x', redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(calls[0]?.redirect).toBe('manual');
  });
});
