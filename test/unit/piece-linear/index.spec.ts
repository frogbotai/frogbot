import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../../packages/frogbot/src/types/request.js';
import {
  createLinear,
  linearActions,
  linearTriggers,
} from '../../../packages/pieces/piece-linear/src/index.js';
import { conformanceChannelState } from '../frogbot/pieces/channelState.js';

const auth = { accessToken: 'linear-access-token' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('linear', () => {
  it('passes channel conformance with a recorded Agent Session delivery', async () => {
    const delivery = {
      action: 'created',
      type: 'AgentSessionEvent',
      webhookTimestamp: Date.now(),
      organizationId: 'organization-id',
      createdAt: '2026-09-14T12:00:00Z',
      promptContext: 'Help with this issue',
      agentSession: {
        id: 'session-id',
        issueId: 'issue-id',
        appUserId: 'app-user-id',
        creator: {
          id: 'user-id',
          name: 'Frog',
          email: 'frog@example.com',
          url: 'https://linear.app/frogbot/profiles/frog',
        },
      },
    };
    const body = JSON.stringify(delivery);
    const webhookSecret = 'linear-webhook-secret';
    const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const { query } = JSON.parse(init.body);

        if (query.includes('LinearAdapterViewerOrganization')) {
          return Response.json({
            data: {
              viewer: {
                id: 'app-user-id',
                displayName: 'FrogBot',
                organization: { id: 'organization-id' },
              },
            },
          });
        }

        if (query.includes('user')) {
          return Response.json({
            data: { user: { id: 'user-id', name: 'Frog', email: 'frog@example.com' } },
          });
        }

        throw new Error(`Unexpected Linear query: ${query}`);
      }),
    );

    await expect(
      pieceConformance(createLinear, {
        factoryOptions: { auth, webhookSecret },
        actions: linearActions.map((slug) => ({ slug, input: {}, expect: { error: /./ } })),
        triggers: linearTriggers.map((slug) => ({ slug, type: 'webhook' as const })),
        oauth: true,
        channel: {
          adapter: { name: 'linear' },
          identity: {
            author: { userId: 'user-id', userName: 'frog' },
            req: {
              frogbot: {
                config: {
                  _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) },
                },
                find: vi.fn().mockResolvedValue({ docs: [] }),
              },
            } as unknown as FrogbotRequest,
            expect: null,
          },
          webhook: {
            state: conformanceChannelState(),
            requests: [
              {
                request: {
                  headers: { 'linear-signature': signature },
                  body,
                  data: delivery,
                },
                verified: true,
                event: 'AgentSessionEvent',
                delivery: {
                  status: 200,
                  messages: [
                    {
                      id: 'agent-session-session-id',
                      threadId: 'linear:issue-id:s:session-id',
                      text: 'Help with this issue',
                      authorId: 'user-id',
                    },
                  ],
                },
              },
              {
                request: {
                  headers: { 'linear-signature': '0'.repeat(64) },
                  body,
                  data: delivery,
                },
                verified: false,
                delivery: { status: 400, messages: [] },
              },
            ],
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('defaults to Agent Sessions and permits the comments fallback', () => {
    const definition = pieceFactoryDefinition(createLinear);
    const primary = definition.channel?.adapter({
      auth,
      options: { webhookSecret: 'secret', channelMode: 'agent-sessions' },
    });
    const fallback = definition.channel?.adapter({
      auth: { apiKey: 'linear-api-key' },
      options: { webhookSecret: 'secret', channelMode: 'comments' },
    });

    expect(primary?.encodeThreadId({ issueId: 'issue', agentSessionId: 'session' })).toBe(
      'linear:issue:s:session',
    );
    expect(fallback?.encodeThreadId({ issueId: 'issue', commentId: 'comment' })).toBe(
      'linear:issue:c:comment',
    );
    expect(() => definition.channel?.adapter({ auth, options: {} as never })).toThrow(
      'webhookSecret',
    );
  });

  it('maps stored OAuth tokens and declares app-actor authorization', () => {
    const oauth = pieceFactoryDefinition(createLinear).oauth;

    expect(oauth).toMatchObject({
      authorizationUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      params: { actor: 'app' },
    });
    expect(oauth?.toAuth?.({ tokens: { access_token: 'stored-token' } })).toEqual({
      accessToken: 'stored-token',
    });
    expect(() => oauth?.toAuth?.({ tokens: {} })).toThrow(
      'Linear OAuth did not return an access token',
    );
  });

  it('matches Linear authors to FrogBot users by email', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'user-1' }] });
    const client = { user: vi.fn().mockResolvedValue({ email: ' Frog@Example.com ' }) };
    const req = {
      frogbot: {
        config: {
          _internal: { payloadConfig: Promise.resolve({ admin: { user: 'members' } }) },
        },
        find,
      },
    } as unknown as FrogbotRequest;

    const identity = await pieceFactoryDefinition(createLinear).channel?.identity({
      author: { userId: 'linear-user', userName: 'frog' } as never,
      client: client as never,
      req,
    });

    expect(identity).toEqual({ id: 'user-1', collection: 'members' });
    expect(find).toHaveBeenCalledWith({
      collection: 'members',
      where: { email: { equals: 'frog@example.com' } },
      limit: 1,
      overrideAccess: true,
      req,
    });
  });
});
