import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSlackAdapter } from '../../../../packages/pieces/piece-slack/node_modules/@chat-adapter/slack/dist/index.js';
import { channelFixture, deferred } from './helpers.js';

const signingSecret = 'test-signing-secret';
const apiCalls: string[] = [];
const server = createServer(async (req, res) => {
  await text(req);

  apiCalls.push(req.url!);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({ ok: true, ts: '2.000001', channel: 'C1', message: { text: 'Hello back' } }),
  );
});

function signedRequest({ retry = false, payload = eventPayload() } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex');

  return new Request('http://localhost/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': `v0=${signature}`,
      ...(retry ? { 'x-slack-retry-num': '1' } : {}),
    },
  });
}

function eventPayload() {
  return {
    type: 'event_callback',
    event_id: 'Ev1',
    team_id: 'T1',
    event: {
      type: 'app_mention',
      channel: 'C1',
      ts: '1.000001',
      text: 'Hello',
      user: 'U1',
      username: 'frog',
    },
  };
}

function fixture(shared?: ReturnType<typeof channelFixture>) {
  const adapter = createSlackAdapter({
    botToken: 'xoxb-test',
    botUserId: 'UBOT',
    signingSecret,
    apiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    nativeStreaming: false,
    webClientOptions: { retryConfig: { retries: 0 } },
  });

  const current = channelFixture({ adapter });

  if (shared) current.frogbot.kv = shared.kv;

  return current;
}

describe('installed Slack adapter channel runtime', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('verifies a signed delivery, waits for enqueue, and posts from a deserialized thread', async () => {
    const current = fixture();
    const held = deferred();

    current.queue.mockImplementation(async ({ input }) => {
      await held.promise;

      current.inputs.push(input);
    });

    await current.host.initialize(false);

    let acknowledged = false;
    const pending = current.host.webhook('slack', signedRequest()).then((response) => {
      acknowledged = true;

      return response;
    });

    await vi.waitFor(() => expect(current.queue).toHaveBeenCalledOnce());

    expect(acknowledged).toBe(false);

    held.resolve();

    expect((await pending)?.status).toBe(200);

    await current.host.run(JSON.parse(JSON.stringify(current.inputs[0])));

    expect(current.values.get('channels:support:slack:subscription:slack:C1:1.000001')).toBe(true);
    expect(apiCalls).toContain('/chat.postMessage');
    expect(apiCalls).toContain('/chat.update');

    await current.host.webhook('slack', signedRequest({ retry: true }));

    expect(current.inputs).toHaveLength(1);

    await current.host.shutdown();
  });

  it('rejects invalid signatures and forged forwarding headers without queueing', async () => {
    const current = fixture();

    await current.host.initialize(false);

    const invalid = signedRequest();

    invalid.headers.set('x-slack-signature', 'v0=invalid');

    expect((await current.host.webhook('slack', invalid))?.status).toBe(401);

    const forwarded = signedRequest();

    forwarded.headers.set('x-slack-socket-token', 'forged');

    expect((await current.host.webhook('slack', forwarded))?.status).toBe(401);
    expect(current.queue).not.toHaveBeenCalled();

    await current.host.shutdown();
  });

  it.each([false, true])(
    'characterizes upstream suppression of redelivery after failed enqueue (retry header: %s)',
    async (retry) => {
      const current = fixture();

      current.queue.mockRejectedValueOnce(new Error('database unavailable'));

      await current.host.initialize(false);

      try {
        await expect(current.host.webhook('slack', signedRequest())).rejects.toThrow(
          'Channel webhook processing failed',
        );

        expect((await current.host.webhook('slack', signedRequest({ retry })))?.status).toBe(200);

        expect(current.inputs).toHaveLength(0);
        expect(current.queue).toHaveBeenCalledOnce();
      } finally {
        await current.host.shutdown();
      }
    },
  );

  it('keeps distinct messages in the same thread while another enqueue is pending', async () => {
    const current = fixture();
    const other = fixture(current);
    const held = deferred();

    current.queue.mockImplementationOnce(async ({ input }) => {
      await held.promise;

      current.inputs.push(input);
    });

    await Promise.all([current.host.initialize(false), other.host.initialize(false)]);

    const pending = current.host.webhook('slack', signedRequest());

    try {
      await vi.waitFor(() => expect(current.queue).toHaveBeenCalledOnce());

      const payload = eventPayload();

      for (const ts of ['1.000002', '1.000003']) {
        const event = { ...payload.event, ts, thread_ts: payload.event.ts };
        const request = signedRequest({
          payload: {
            ...payload,
            event_id: `Ev${ts}`,
            event,
          },
        });

        expect((await other.host.webhook('slack', request))?.status).toBe(200);
      }

      expect(other.inputs).toHaveLength(2);

      held.resolve();

      expect((await pending)?.status).toBe(200);
      expect(current.inputs).toHaveLength(1);
      expect(
        new Set([...current.inputs, ...other.inputs].map(({ thread }) => thread.id)).size,
      ).toBe(1);
    } finally {
      held.resolve();
      await pending;
      await Promise.all([current.host.shutdown(), other.host.shutdown()]);
    }
  });

  it.each([{ user: 'UBOT' }, { user: '', bot_id: 'BBOT', bot_profile: { user_id: 'UBOT' } }])(
    'ignores signed self replies ($user)',
    async (author) => {
      const current = fixture();
      const payload = eventPayload();

      await current.host.initialize(false);

      try {
        const response = await current.host.webhook(
          'slack',
          signedRequest({ payload: { ...payload, event: { ...payload.event, ...author } } }),
        );

        expect(response?.status).toBe(200);
        expect(current.queue).not.toHaveBeenCalled();
      } finally {
        await current.host.shutdown();
      }
    },
  );
});
