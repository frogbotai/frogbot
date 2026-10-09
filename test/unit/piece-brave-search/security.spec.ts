import { afterEach, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createBraveSearch } from '../../../packages/pieces/piece-brave-search/src/index.js';

const auth = { apiKey: 'brave-test' };
const req = {
  frogbot: {
    connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
  },
  user: null,
} as never;

afterEach(() => vi.unstubAllGlobals());

it('does not follow redirects with the Brave credential', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: 'https://attacker.example/collect' },
    }),
  );

  vi.stubGlobal('fetch', fetch);

  await expect(
    createBraveSearch({ auth }).customApiCall({
      input: { method: 'GET', path: '/web/search' },
      req,
    }),
  ).rejects.toThrow('Brave Search API redirected (302) to https://attacker.example/collect.');

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('manual');
});

it('keeps custom request paths on the Brave API origin', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

  vi.stubGlobal('fetch', fetch);

  await expect(
    createBraveSearch({ auth }).customApiCall({
      input: { method: 'GET', path: '//attacker.example/collect' },
      req,
    }),
  ).rejects.toThrow('custom API path must be relative to the Brave Search API');

  expect(fetch).not.toHaveBeenCalled();
});
