import { generateKeyPairSync, sign } from 'node:crypto';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import https from 'node:https';
import { Readable, Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { CHANNEL_TASK_SLUG } from '../../../packages/frogbot/src/channels/host.js';
import { buildTriggerEndpoints } from '../../../packages/frogbot/src/triggers/endpoints.js';
import { AGENT_TRIGGER_TASK_SLUG } from '../../../packages/frogbot/src/triggers/task.js';
import { createMicrosoftTeams } from '../../../packages/pieces/piece-microsoft-teams/src/index.js';
import { ingressFixture } from '../frogbot/channels/ingress.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
};
const serviceUrl = 'https://smba.trafficmanager.net/amer/';
const activity = {
  type: 'message',
  id: 'message-1',
  timestamp: '2026-09-15T12:00:00Z',
  channelId: 'msteams',
  serviceUrl,
  from: { id: '29:user', name: 'Frog' },
  recipient: { id: '28:bot-app-id', name: 'FrogBot' },
  conversation: { id: 'personal-1', conversationType: 'personal', tenantId: 'tenant' },
  text: 'Hello',
};

const post = buildTriggerEndpoints().find(
  ({ method, path }) => method === 'post' && path === '/webhooks/:instance',
)!;

const fixtures: ReturnType<typeof ingressFixture>[] = [];
const jwksRequests: RequestOptions[] = [];

function fixture(conversational = false) {
  const instance = createMicrosoftTeams({
    auth: { appId: 'bot-app-id', appPassword: 'bot-password' },
  });

  const result = ingressFixture({ instance, triggerSlugs: ['messageReceived'], conversational });

  fixtures.push(result);

  return result;
}

function token(claims: Record<string, unknown> = {}, validSignature = true) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString(
    'base64url',
  );

  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://api.botframework.com',
      aud: 'bot-app-id',
      serviceurl: serviceUrl,
      iat: now,
      nbf: now - 60,
      exp: now + 3600,
      ...claims,
    }),
  ).toString('base64url');

  const unsigned = `${header}.${payload}`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(unsigned),
    validSignature ? keys.privateKey : wrongKeys.privateKey,
  );

  return `${unsigned}.${signature.toString('base64url')}`;
}

beforeEach(() => {
  jwksRequests.length = 0;

  const transport = (options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    if (options.hostname !== 'login.botframework.com' || options.path !== '/v1/.well-known/keys') {
      throw new Error(`Unexpected HTTPS request: ${options.hostname}${options.path}`);
    }

    jwksRequests.push(options);

    return new Writable({
      final(done) {
        const response = Object.assign(Readable.from([JSON.stringify({ keys: [jwk] })]), {
          statusCode: 200,
        });

        callback(response as IncomingMessage);
        done();
      },
    }) as ClientRequest;
  };

  vi.spyOn(https, 'request').mockImplementation(transport as typeof https.request);
});

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.shutdown()));

  vi.restoreAllMocks();
});

describe('Teams adapter-verified ingress', () => {
  it.each([false, true])(
    'validates a generated JWT through the official JWKS verifier, conversational = %s',
    async (conversational) => {
      const { initialize, request, frogbot } = fixture(conversational);

      await initialize();

      const response = await post.handler(
        request(JSON.stringify(activity), { authorization: `Bearer ${token()}` }) as never,
      );

      expect(response.status).toBe(200);
      expect(jwksRequests).toHaveLength(1);
      expect(frogbot.queue.mock.calls.map(([job]) => job.task)).toEqual(
        conversational ? [CHANNEL_TASK_SLUG, AGENT_TRIGGER_TASK_SLUG] : [AGENT_TRIGGER_TASK_SLUG],
      );
      expect(frogbot.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          task: AGENT_TRIGGER_TASK_SLUG,
          input: expect.objectContaining({
            agentSlug: 'ops',
            instanceSlug: 'microsoft-teams',
            triggerSlug: 'messageReceived',
            event: expect.objectContaining({ data: activity }),
          }),
        }),
      );
    },
  );

  it.each([
    { name: 'wrong signature', claims: {}, signature: false },
    { name: 'wrong audience', claims: { aud: 'another-bot' }, signature: true },
    { name: 'wrong issuer', claims: { iss: 'https://example.com' }, signature: true },
    { name: 'wrong service URL', claims: { serviceurl: 'https://example.com' }, signature: true },
    { name: 'expired token', claims: { exp: 1 }, signature: true },
  ])('rejects $name before dispatch', async ({ claims, signature }) => {
    const { initialize, request, frogbot } = fixture();

    await initialize();

    const response = await post.handler(
      request(JSON.stringify(activity), {
        authorization: `Bearer ${token(claims, signature)}`,
      }) as never,
    );

    expect(response.status).toBe(401);
    expect(jwksRequests).toHaveLength(1);
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it.each(['', 'Bearer invalid.jwt.token'])(
    'rejects missing or malformed authorization (%s)',
    async (authorization) => {
      const { initialize, request, frogbot } = fixture();

      await initialize();

      const response = await post.handler(
        request(JSON.stringify(activity), { authorization }) as never,
      );

      expect(response.status).toBe(401);
      expect(jwksRequests).toHaveLength(0);
      expect(frogbot.queue).not.toHaveBeenCalled();
    },
  );

  it('rejects trigger-only boot without Azure Bot credentials', async () => {
    const instance = createMicrosoftTeams({ auth: { accessToken: 'graph-only' } });
    const result = ingressFixture({ instance, triggerSlugs: ['messageReceived'] });

    fixtures.push(result);

    await expect(result.initialize()).rejects.toThrow('Azure Bot appId and appPassword');
  });
});
