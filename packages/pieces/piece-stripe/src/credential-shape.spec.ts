import { afterEach, expect, it, vi } from 'vitest';

import { adaptCredential } from '../../../frogbot/src/connections/adapters.js';
import { createStripe } from './index.js';

afterEach(() => vi.unstubAllGlobals());

it('sends the developer credential through the real action', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'customer-id' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const stripe = createStripe({ auth: { apiKey: 'sk-test' } });
  const tool = stripe.tools().find(({ slug }) => slug === 'stripe_create_customer')!;

  await tool.execute({ email: 'frog@example.com', name: 'Frog Bot' }, {
    req: {},
    frogbot: { connections: { resolve: () => adaptCredential('secret_text', { apiKey: 'sk-test' }) } },
  } as never);

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
});
