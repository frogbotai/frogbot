import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createPosthog, posthogActions } from '../../../packages/pieces/piece-posthog/src/index.js';

const auth = { personalApiKey: 'phx_test' };
const req = {
  frogbot: {
    connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
  },
  user: null,
} as never;

afterEach(() => vi.unstubAllGlobals());

describe('posthog', () => {
  it('exposes every upstream action with semantic names', () => {
    const posthog = createPosthog({ auth });

    expect(pieceInstanceTools(posthog)?.map(({ slug }) => slug)).toEqual(
      posthogActions.map((slug) => `posthog_${slug}`),
    );
  });

  it('parses auth before creating the client', async () => {
    const invalidAuth = { personalApiKey: '' };
    const invalidReq = {
      frogbot: {
        connections: {
          resolvePieceCredential: vi.fn().mockResolvedValue({
            auth: invalidAuth,
            key: invalidAuth,
          }),
        },
      },
      user: null,
    } as never;

    await expect(
      createPosthog({ auth }).createProject({
        input: { name: 'FrogBot' },
        req: invalidReq,
      }),
    ).rejects.toThrow();
  });

  it('maps event input to the capture request', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const result = await createPosthog({ auth }).createEvent({
      input: {
        event: 'signed_up',
        eventType: 'capture',
        distinctId: 'user-1',
        properties: { plan: 'pro' },
        messageId: 'message-1',
      },
      req,
    });

    expect(result).toEqual({ status: 1 });
    expect(fetch.mock.calls[0]?.[0].toString()).toBe('https://app.posthog.com/capture/');
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer phx_test' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      event: 'signed_up',
      type: 'capture',
      api_key: 'phx_test',
      messageId: 'message-1',
      context: {},
      properties: { plan: 'pro' },
      distinct_id: 'user-1',
    });
  });

  it('maps project input to PostHog field names', async () => {
    const project = { id: 7, uuid: 'uuid', name: 'FrogBot', api_token: 'token' };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(project), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      createPosthog({ auth }).createProject({
        input: { name: 'FrogBot', anonymizeIps: true, isDemo: false },
        req,
      }),
    ).resolves.toEqual(project);
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      name: 'FrogBot',
      anonymize_ips: true,
      is_demo: false,
    });
  });

  it('returns a parsed custom response and preserves query parameters', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'request-1' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const result = await createPosthog({ auth }).customApiCall({
      input: { method: 'GET', path: '/api/projects/', query: { limit: 10 } },
      req,
    });

    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'https://app.posthog.com/api/projects/?limit=10',
    );
    expect(result).toMatchObject({ status: 200, body: { results: [] } });
  });

  it('rejects external custom URLs and reports PostHog failures', async () => {
    await expect(
      createPosthog({ auth }).customApiCall({
        input: { method: 'GET', path: 'https://example.com/api' },
        req,
      }),
    ).rejects.toThrow('Path must target the PostHog API.');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Invalid API key' }), {
          status: 401,
          statusText: 'Unauthorized',
        }),
      ),
    );

    await expect(
      createPosthog({ auth }).createProject({ input: { name: 'FrogBot' }, req }),
    ).rejects.toThrow('PostHog request failed (401): Invalid API key');
  });
});
