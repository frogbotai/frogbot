import { afterEach, expect, it, vi } from 'vitest';

import { adaptCredential } from '../../../frogbot/src/connections/adapters.js';
import { createResend } from './index.js';

afterEach(() => vi.unstubAllGlobals());

it('sends the developer credential through the real action', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const resend = createResend({ auth: { apiKey: 'sk-test' } });
  const tool = resend.tools().find(({ slug }) => slug === 'resend_send_email')!;

  await tool.execute({
    to: ['to@example.com'],
    from_name: 'FrogBot',
    from: 'from@example.com',
    subject: 'Test',
    content_type: 'text',
    content: 'Test',
  }, {
    req: {},
    frogbot: { connections: { resolve: () => adaptCredential('secret_text', { apiKey: 'sk-test' }) } },
  } as never);

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
});
