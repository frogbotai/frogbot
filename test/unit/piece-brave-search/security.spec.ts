import { afterEach, expect, it, vi } from 'vitest';

import { createBraveSearchClient } from '../../../packages/pieces/piece-brave-search/src/client.js';

afterEach(() => vi.unstubAllGlobals());

it('does not follow redirects with the Brave credential', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: 'https://attacker.example/collect' },
    }),
  );
  vi.stubGlobal('fetch', fetch);

  const client = createBraveSearchClient({ auth: { apiKey: 'brave-test' } });

  await client.request({ path: '/web/search', followRedirects: true, failsafe: true });

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('manual');
});

it('keeps custom request paths on the Brave API origin', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);

  const client = createBraveSearchClient({ auth: { apiKey: 'brave-test' } });

  await client.request({ path: '//attacker.example/collect' });

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[0]).toEqual(
    new URL('https://api.search.brave.com/res/v1//attacker.example/collect'),
  );
});
