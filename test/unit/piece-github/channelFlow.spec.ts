import { createHmac, generateKeyPairSync, verify } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createGithub } from '../../../packages/pieces/piece-github/src/index.js';
import { channelFixture } from '../frogbot/channels/helpers.js';

afterEach(() => vi.unstubAllGlobals());

describe('GitHub App channel conversation', () => {
  it('exchanges signed App credentials and replies to mentions and subscribed follow-ups', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const auth = {
      appId: '12345',
      installationId: 67890,
      privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };

    const webhookSecret = 'channel-flow-secret';
    const github = createGithub({ auth, webhookSecret, botUsername: 'frogbot', botUserId: 99 });
    const fixture = channelFixture({ slug: github.slug });

    fixture.frogbot.agents.support.config.channels.splice(0, 1, github as never);
    fixture.frogbot.connections.resolvePieceCredential.mockResolvedValue({ auth, key: github });

    const calls: Array<{ path: string; body: unknown }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        const headers = new Headers(init?.headers);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;

        calls.push({ path, body });

        if (path === '/app/installations/67890/access_tokens') {
          const jwt = headers.get('authorization')!.replace(/^bearer /i, '');
          const [header, payload, signature] = jwt.split('.');

          expect(JSON.parse(Buffer.from(payload!, 'base64url').toString()).iss).toBe('12345');
          expect(
            verify(
              'RSA-SHA256',
              Buffer.from(`${header}.${payload}`),
              keys.publicKey,
              Buffer.from(signature!, 'base64url'),
            ),
          ).toBe(true);

          return Response.json({
            token: 'installation-token',
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }

        if (path === '/users/octocat') {
          expect(headers.get('authorization')).toBe('Bearer installation-token');

          return Response.json({ email: null });
        }

        if (path === '/repos/frogbotai/frogbot/issues/12/comments') {
          expect(headers.get('authorization')).toBe('token installation-token');
          expect(init?.method).toBe('POST');

          return Response.json({
            id: 900 + calls.length,
            body: body.body,
            user: { id: 99, login: 'frogbot[bot]', type: 'Bot' },
          });
        }

        throw new Error(`Unexpected GitHub request: ${path}`);
      }),
    );

    const deliver = async (id: number, text: string, secret = webhookSecret) => {
      const body = JSON.stringify({
        action: 'created',
        comment: {
          id,
          body: text,
          user: { id: 42, login: 'octocat', type: 'User' },
          created_at: '2026-09-15T12:00:00Z',
          updated_at: '2026-09-15T12:00:00Z',
        },
        issue: { number: 12 },
        repository: { name: 'frogbot', owner: { login: 'frogbotai' } },
        sender: { id: 42, login: 'octocat' },
      });

      return fixture.host.webhook(
        github.slug,
        new Request('https://example.com/api/webhooks/github', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-github-event': 'issue_comment',
            'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
          },
          body,
        }),
      );
    };

    await fixture.host.initialize(false);

    try {
      expect((await deliver(1, '@frogbot help', 'wrong-secret'))?.status).toBe(401);
      await deliver(2, 'An ordinary comment');

      expect(fixture.inputs).toHaveLength(0);

      expect((await deliver(3, '@frogbot help'))?.status).toBe(200);
      expect(fixture.inputs).toHaveLength(1);

      await fixture.host.run(fixture.inputs[0]!);
      await deliver(4, 'Follow-up without a mention');

      expect(fixture.inputs).toHaveLength(2);

      await fixture.host.run(fixture.inputs[1]!);
      await deliver(4, 'Follow-up without a mention');

      expect(fixture.inputs).toHaveLength(2);
      expect(fixture.streamMessage.mock.calls.map(([call]) => call.chatId)).toEqual([
        'chat-1',
        'chat-1',
      ]);
      expect(calls.filter(({ path }) => path.endsWith('/comments'))).toEqual([
        { path: '/repos/frogbotai/frogbot/issues/12/comments', body: { body: 'Hello back' } },
        { path: '/repos/frogbotai/frogbot/issues/12/comments', body: { body: 'Hello back' } },
      ]);
      expect(calls.filter(({ path }) => path.endsWith('/access_tokens'))).toHaveLength(2);
    } finally {
      await fixture.host.shutdown();
    }
  });
});
