import { pieceContract } from 'frogbot/pieces/test';
import { afterEach, expect, it, vi } from 'vitest';

import { adaptCredential } from '../../../frogbot/src/connections/adapters.js';
import { createBraveSearch, braveSearchActions } from './index.js';

const braveSearch = createBraveSearch();
pieceContract({ piece: braveSearch, service: 'brave', credentialType: 'secret_text', actions: braveSearchActions });
afterEach(() => vi.unstubAllGlobals());

it('sends the Brave credential through the real action', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const tool = createBraveSearch({ auth: { apiKey: 'brave-test' } }).tools()[0]!;
  await tool.execute({ query: 'frogbot' }, { req: {}, frogbot: { connections: { resolve: () => adaptCredential('secret_text', { apiKey: 'brave-test' }) } } } as never);
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('X-Subscription-Token')).toBe('brave-test');
});
