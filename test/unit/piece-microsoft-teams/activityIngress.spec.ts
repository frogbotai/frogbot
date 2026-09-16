import { generateKeyPairSync, sign } from 'node:crypto';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import https from 'node:https';
import { Readable, Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { buildTriggerEndpoints } from '../../../packages/frogbot/src/triggers/endpoints.js';
import { AGENT_TRIGGER_TASK_SLUG } from '../../../packages/frogbot/src/triggers/task.js';
import { createMicrosoftTeams } from '../../../packages/pieces/piece-microsoft-teams/src/index.js';
import { ingressFixture } from '../frogbot/channels/ingress.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'activity-key',
  alg: 'RS256',
  use: 'sig',
};

const serviceUrl = 'https://smba.trafficmanager.net/amer/';
const endpoint = buildTriggerEndpoints().find(
  ({ method, path }) => method === 'post' && path === '/webhooks/:instance',
)!;

const activities = [
  { trigger: 'messageReceived', data: { type: 'message', text: 'Hello' } },
  {
    trigger: 'cardActionReceived',
    data: { type: 'message', value: { actionId: 'approve', value: 'yes' } },
  },
  {
    trigger: 'cardActionReceived',
    data: {
      type: 'invoke',
      name: 'adaptiveCard/action',
      value: { action: { type: 'Action.Execute', data: { actionId: 'approve', value: 'yes' } } },
    },
  },
  {
    trigger: 'messageReactionReceived',
    data: { type: 'messageReaction', reactionsAdded: [{ type: 'like' }] },
  },
  {
    trigger: 'conversationUpdated',
    data: { type: 'conversationUpdate', membersAdded: [{ id: '29:user' }] },
  },
  { trigger: 'installationUpdated', data: { type: 'installationUpdate', action: 'add' } },
  {
    trigger: 'dialogOpened',
    data: { type: 'invoke', name: 'task/fetch', value: { data: { actionId: 'open' } } },
  },
  {
    trigger: 'dialogSubmitted',
    data: { type: 'invoke', name: 'task/submit', value: { data: { answer: 'yes' } } },
  },
];

const fixtures: ReturnType<typeof ingressFixture>[] = [];

function token(audience = 'bot-app-id') {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString(
    'base64url',
  );

  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://api.botframework.com',
      aud: audience,
      serviceurl: serviceUrl,
      nbf: now - 60,
      exp: now + 3600,
    }),
  ).toString('base64url');

  const unsigned = `${header}.${payload}`;

  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), keys.privateKey).toString('base64url')}`;
}

beforeEach(() => {
  const transport = (options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    expect(options.hostname).toBe('login.botframework.com');
    expect(options.path).toBe('/v1/.well-known/keys');

    return new Writable({
      final(done) {
        callback(
          Object.assign(Readable.from([JSON.stringify({ keys: [jwk] })]), {
            statusCode: 200,
          }) as IncomingMessage,
        );

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

describe.each([false, true])(
  'Teams Activity ingress with conversational binding = %s',
  (conversational) => {
    it.each(activities)(
      'authenticates and dispatches $trigger ($data.type)',
      async ({ trigger, data }) => {
        const instance = createMicrosoftTeams({
          auth: { appId: 'bot-app-id', appPassword: 'bot-password' },
        });

        const fixture = ingressFixture({ instance, triggerSlugs: [trigger], conversational });

        fixtures.push(fixture);

        const activity = {
          ...data,
          id: 'activity-1',
          timestamp: '2026-09-15T12:00:00Z',
          channelId: 'msteams',
          serviceUrl,
          from: { id: '29:user', name: 'Frog' },
          recipient: { id: '28:bot-app-id', name: 'FrogBot' },
          conversation: { id: 'personal-1', conversationType: 'personal', tenantId: 'tenant' },
        };

        await fixture.initialize();

        const rejected = await endpoint.handler(
          fixture.request(JSON.stringify(activity), {
            authorization: `Bearer ${token('another-bot')}`,
          }) as never,
        );

        expect(rejected.status).toBe(401);
        expect(fixture.frogbot.queue).not.toHaveBeenCalled();

        const accepted = await endpoint.handler(
          fixture.request(JSON.stringify(activity), {
            authorization: `Bearer ${token()}`,
          }) as never,
        );

        expect(accepted.status).toBe(200);
        expect(
          fixture.frogbot.queue.mock.calls.filter(([job]) => job.task === AGENT_TRIGGER_TASK_SLUG),
        ).toEqual([
          [
            expect.objectContaining({
              task: AGENT_TRIGGER_TASK_SLUG,
              input: expect.objectContaining({
                triggerSlug: trigger,
                event: { data: activity, dedupeKey: activity.id },
              }),
            }),
          ],
        ]);
      },
    );
  },
);
