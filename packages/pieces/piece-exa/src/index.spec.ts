import { pieceContract } from 'frogbot/pieces/test';
import { afterEach, expect, it, vi } from 'vitest';

import { adaptCredential } from '../../../frogbot/src/connections/adapters.js';
import { createExa, exaActions } from './index.js';

const exa = createExa();
pieceContract({ piece: exa, service: 'exa', credentialType: 'secret_text', actions: exaActions });
afterEach(() => vi.unstubAllGlobals());

it('does not expose custom API calls', () => {
  expect(exa.actions).not.toContain('custom_api_call');
  expect(() => exa.tool('custom_api_call')).toThrow();
});

it('sends the Exa credential through the real action', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const tool = createExa({ auth: { apiKey: 'exa-test' } }).tools()[0]!;
  await tool.execute({ query: 'frogbot' }, { req: {}, frogbot: { connections: { resolve: () => adaptCredential('secret_text', { apiKey: 'exa-test' }) } } } as never);
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-api-key')).toBe('exa-test');
});
