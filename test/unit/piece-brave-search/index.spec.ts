import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  braveSearchActions,
  createBraveSearch,
} from '../../../packages/pieces/piece-brave-search/src/index.js';

const req = (auth = { apiKey: 'brave-test-key' }) =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;

afterEach(() => vi.unstubAllGlobals());

describe('brave-search', () => {
  it('exposes every upstream action under semantic names', () => {
    const brave = createBraveSearch({ auth: { apiKey: 'brave-test-key' } });

    expect(pieceInstanceTools(brave)?.map(({ slug }) => slug)).toEqual(
      braveSearchActions.map((slug) => `brave-search_${slug}`),
    );
  });

  it('maps web search auth and query parameters exactly', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'search',
          query: { original: 'frog bot' },
          web: { results: [{ title: 'FrogBot', url: 'https://frogbot.ai', description: 'AI' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await createBraveSearch({ auth: { apiKey: 'brave-test-key' } }).searchWeb({
      input: { query: 'frog bot', count: 3 },
      req: req(),
    });
    const [url, options] = fetch.mock.calls[0] as [URL, RequestInit];

    expect(url.toString()).toBe(
      'https://api.search.brave.com/res/v1/web/search?q=frog+bot&count=3',
    );
    expect(options.method).toBe('GET');
    expect(Object.fromEntries(new Headers(options.headers))).toMatchObject({
      accept: 'application/json',
      'x-subscription-token': 'brave-test-key',
    });
    expect(result.web?.results[0]).toMatchObject({ title: 'FrogBot', url: 'https://frogbot.ai' });
  });

  it('maps custom API calls and returns the response envelope', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'X-Fixture': 'brave' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await createBraveSearch({ auth: { apiKey: 'brave-test-key' } }).customApiCall({
      input: {
        method: 'POST',
        path: '/web/search',
        headers: { 'X-Test': 'yes' },
        queryParams: { q: 'frogs', tag: ['green', 'small'] },
        bodyType: 'json',
        body: { count: 2 },
      },
      req: req(),
    });
    const [url, options] = fetch.mock.calls[0] as [URL, RequestInit];

    expect(url.toString()).toBe(
      'https://api.search.brave.com/res/v1/web/search?q=frogs&tag=green&tag=small',
    );
    expect(options).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ count: 2 }),
      redirect: 'manual',
    });
    expect(Object.fromEntries(new Headers(options.headers))).toMatchObject({
      'content-type': 'application/json',
      'x-subscription-token': 'brave-test-key',
      'x-test': 'yes',
    });
    expect(result).toMatchObject({ status: 201, body: { ok: true } });
  });

  it('rejects invalid auth and search counts before transport', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const brave = createBraveSearch({ auth: { apiKey: 'brave-test-key' } });

    expect(() => createBraveSearch({ auth: { apiKey: '' } })).toThrow();
    await expect(
      brave.searchWeb({ input: { query: 'frog', count: 21 }, req: req() }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves useful vendor failures and supports failsafe responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid subscription token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const brave = createBraveSearch({ auth: { apiKey: 'brave-test-key' } });

    await expect(brave.searchWeb({ input: { query: 'frog' }, req: req() })).rejects.toThrow(
      'Brave Search request failed (401): {"error":"invalid subscription token"}',
    );
    await expect(
      brave.customApiCall({
        input: { method: 'GET', path: '/web/search', failsafe: true },
        req: req(),
      }),
    ).resolves.toMatchObject({ status: 429, body: { error: 'rate limited' } });
  });
});
