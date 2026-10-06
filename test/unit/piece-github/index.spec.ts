import { createHash, createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock(
  'frogbot/pieces/test',
  () => import('../../../packages/frogbot/src/exports/pieces-test.js'),
);

import type { FrogBotRequest } from 'frogbot';
import { pieceConformance } from 'frogbot/pieces/test';

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest as DefinitionRequest } from '../../../packages/frogbot/src/types/request.js';
import {
  createBranch,
  createDiscussionComment,
  createIssue,
  customApiCall,
} from '../../../packages/pieces/piece-github/src/actions.js';
import { createGithubClient } from '../../../packages/pieces/piece-github/src/client.js';
import {
  createGithub,
  githubActions,
  githubOAuth,
  githubTriggers,
} from '../../../packages/pieces/piece-github/src/index.js';
import {
  branchCreated,
  collaboratorAdded,
  commitCreated,
  labelCreated,
  mentioned,
  milestoneCreated,
  releaseCreated,
  reviewRequested,
} from '../../../packages/pieces/piece-github/src/triggers.js';
import { conformanceChannelState } from '../frogbot/pieces/channelState.js';

const auth = { accessToken: 'github-token' };
const appAuth = {
  appId: '12345',
  privateKey: 'private-key',
  installationId: 67890,
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(overrides: Partial<FrogBotRequest> = {}): FrogBotRequest {
  return { headers: new Headers(), ...overrides } as unknown as FrogBotRequest;
}

type Delivery = NonNullable<FrogBotRequest['data']>;

function webhookRequest(headers: Record<string, string>, secret: string, value: Delivery) {
  const body = JSON.stringify(value);

  return request({
    arrayBuffer: () => new Response(body).arrayBuffer(),
    data: value,
    headers: new Headers({
      ...headers,
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('github', () => {
  it('passes native channel conformance with recorded GitHub deliveries', async () => {
    const body = JSON.stringify({
      action: 'created',
      comment: {
        id: 1,
        body: '@frogbot help',
        user: { id: 42, login: 'octocat', type: 'User' },
        created_at: '2026-09-14T12:00:00Z',
        updated_at: '2026-09-14T12:00:00Z',
        html_url: 'https://github.com/frogbotai/frogbot/issues/12#issuecomment-1',
      },
      issue: { number: 12 },
      repository: { name: 'frogbot', owner: { login: 'frogbotai' } },
      sender: { id: 42, login: 'octocat' },
    });
    const webhookSecret = 'github-webhook-secret';
    const signature = `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`;

    await expect(
      pieceConformance(createGithub, {
        factoryOptions: {
          auth: appAuth,
          webhookSecret,
          botUsername: 'frogbot[bot]',
          botUserId: 99,
        },
        actions: githubActions.map((slug) => ({ slug, input: {}, expect: { error: /./ } })),
        triggers: githubTriggers.map((slug) => ({ slug, type: 'webhook' as const })),
        oauth: true,
        channel: {
          adapter: { name: 'github' },
          identity: {
            author: { userId: '42', userName: '', fullName: '', isBot: false, isMe: false },
            req: request(),
            expect: null,
          },
          webhook: {
            state: conformanceChannelState(),
            requests: [
              {
                request: {
                  headers: {
                    'content-type': 'application/json',
                    'x-github-event': 'issue_comment',
                    'x-hub-signature-256': signature,
                  },
                  body,
                  data: JSON.parse(body),
                },
                verified: true,
                event: 'issue_comment',
                delivery: {
                  status: 200,
                  messages: [
                    {
                      id: '1',
                      threadId: 'github:frogbotai/frogbot:issue:12',
                      text: '@frogbot help',
                      authorId: '42',
                    },
                  ],
                },
              },
              {
                request: {
                  headers: {
                    'content-type': 'application/json',
                    'x-github-event': 'issue_comment',
                    'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
                  },
                  body,
                  data: JSON.parse(body),
                },
                verified: false,
                delivery: { status: 401, messages: [] },
              },
              {
                request: {
                  headers: {
                    'content-type': 'application/json',
                    'x-github-event': 'issue_comment',
                    'x-hub-signature-256': `sha256=${createHmac('sha256', webhookSecret).update('{').digest('hex')}`,
                  },
                  body: '{',
                },
                verified: true,
                delivery: { status: 400, messages: [] },
              },
            ],
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('exposes every action and trigger and maps stored OAuth tokens', () => {
    const github = createGithub({ auth });
    const definition = pieceFactoryDefinition(createGithub);

    expect(Object.keys(github).filter((key) => githubActions.includes(key))).toEqual(githubActions);
    expect(Object.keys(github.triggers)).toEqual(githubTriggers);
    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['admin:repo_hook', 'admin:org', 'repo', 'gist', 'user:email'],
    });
    expect(definition.oauth?.toAuth?.({ tokens: { access_token: 'stored-token' } })).toEqual({
      accessToken: 'stored-token',
    });
    expect(() => definition.oauth?.toAuth?.({ tokens: {} })).toThrow(
      'GitHub OAuth did not return an access token',
    );
  });

  it('looks up the private verified primary email for the OAuth account', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 42, login: 'octocat', name: null }))
      .mockResolvedValueOnce(
        json([
          { email: 'public@example.com', primary: false, verified: true, visibility: 'public' },
          { email: 'private@example.com', primary: true, verified: true, visibility: null },
        ]),
      );

    vi.stubGlobal('fetch', fetch);

    await expect(
      githubOAuth.account({
        tokens: { access_token: 'stored-token' },
        client: createGithubClient({ auth: { accessToken: 'stored-token' } }),
        req: request(),
      }),
    ).resolves.toEqual({ id: '42', label: 'octocat', email: 'private@example.com' });
    expect(new Headers(fetch.mock.calls[1][1].headers).get('authorization')).toBe(
      'Bearer stored-token',
    );
  });

  it('requires App credentials and a webhook secret for channels', () => {
    const definition = pieceFactoryDefinition(createGithub);

    expect(() =>
      definition.channel?.adapter({ auth, options: { webhookSecret: 'secret' } }),
    ).toThrow('GitHub App credentials');
    expect(() => definition.channel?.adapter({ auth: appAuth, options: {} })).toThrow(
      'webhookSecret',
    );
  });

  it('delegates issue, pull request, and review thread mapping to the GitHub adapter', () => {
    const adapter = pieceFactoryDefinition(createGithub).channel?.adapter({
      auth: appAuth,
      options: { webhookSecret: 'secret' },
    }) as {
      encodeThreadId(value: {
        owner: string;
        repo: string;
        prNumber: number;
        type?: 'issue' | 'pr';
        reviewCommentId?: number;
      }): string;
    };

    expect(
      adapter.encodeThreadId({ owner: 'org', repo: 'repo', prNumber: 12, type: 'issue' }),
    ).toBe('github:org/repo:issue:12');
    expect(adapter.encodeThreadId({ owner: 'org', repo: 'repo', prNumber: 12, type: 'pr' })).toBe(
      'github:org/repo:12',
    );
    expect(
      adapter.encodeThreadId({ owner: 'org', repo: 'repo', prNumber: 12, reviewCommentId: 99 }),
    ).toBe('github:org/repo:12:rc:99');
  });

  it('matches GitHub authors to FrogBot users by public profile email', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ email: ' Frog@Example.com ' }));
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'user-1' }] });

    vi.stubGlobal('fetch', fetch);

    const identity = await pieceFactoryDefinition(createGithub).channel?.identity({
      author: { userId: '42', userName: 'octocat' } as never,
      client: createGithubClient({ auth }),
      req: {
        frogbot: {
          config: {
            _internal: { payloadConfig: Promise.resolve({ admin: { user: 'members' } }) },
          },
          find,
        },
      } as unknown as DefinitionRequest,
    });

    expect(identity).toEqual({ id: 'user-1', collection: 'members' });
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe('/users/octocat');
    expect(find).toHaveBeenCalledWith({
      collection: 'members',
      where: { email: { equals: 'frog@example.com' } },
      limit: 1,
      overrideAccess: true,
      req: expect.any(Object),
    });
  });

  it('maps action inputs and validates action responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ id: 10, number: 7, title: 'Bug', body: 'Details' }));

    vi.stubGlobal('fetch', fetch);

    const client = createGithubClient({ auth });
    const input = createIssue.input.parse({
      repository: { owner: 'frogbotai', repo: 'frogbot' },
      title: 'Bug',
      description: 'Details',
      labels: ['bug'],
      assignees: ['octocat'],
    });
    const result = await createIssue.run({ client, input, options: {}, req: request() });

    expect(result).toMatchObject({ id: 10, number: 7, title: 'Bug' });
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe(
      '/repos/frogbotai/frogbot/issues',
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      title: 'Bug',
      body: 'Details',
      labels: ['bug'],
      assignees: ['octocat'],
    });

    vi.mocked(fetch).mockResolvedValueOnce(json({ id: 'wrong', number: 7, title: 'Bug' }));

    await expect(createIssue.run({ client, input, options: {}, req: request() })).rejects.toThrow();
  });

  it('loads paginated options and maps branch creation', async () => {
    const branches = Array.from({ length: 100 }, (_, index) => ({
      name: `branch-${index}`,
      commit: { sha: `sha-${index}` },
    }));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(branches))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ name: 'main', commit: { sha: 'source-sha' } }))
      .mockResolvedValueOnce(json({ ref: 'refs/heads/feature', object: { sha: 'source-sha' } }));

    vi.stubGlobal('fetch', fetch);

    const client = createGithubClient({ auth });

    await expect(
      createBranch.options?.sourceBranch?.({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        options: {},
        req: request(),
      }),
    ).resolves.toHaveLength(100);

    const input = createBranch.input.parse({
      repository: { owner: 'org', repo: 'repo' },
      sourceBranch: 'main',
      newBranchName: 'feature',
    });

    await createBranch.run({ client, input, options: {}, req: request() });

    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
      ref: 'refs/heads/feature',
      sha: 'source-sha',
    });
  });

  it('resolves a discussion number to its node ID before creating a comment', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: { repository: { discussion: { id: 'D_kwDODiscussionNode' } } } }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            addDiscussionComment: {
              comment: {
                id: 'DC_kwDOCommentNode',
                body: 'Reply',
                createdAt: '2026-09-13T00:00:00Z',
                url: 'https://github.com/org/repo/discussions/12#discussioncomment-1',
              },
            },
          },
        }),
      );

    vi.stubGlobal('fetch', fetch);

    const input = createDiscussionComment.input.parse({
      repository: { owner: 'org', repo: 'repo' },
      discussionNumber: 12,
      body: 'Reply',
    });

    await createDiscussionComment.run({
      client: createGithubClient({ auth }),
      input,
      options: {},
      req: request(),
    });

    const lookup = JSON.parse(fetch.mock.calls[0][1].body);
    const mutation = JSON.parse(fetch.mock.calls[1][1].body);

    expect(lookup.variables).toEqual({ owner: 'org', repo: 'repo', number: 12 });
    expect(lookup.query).toContain('discussion(number: $number) { id }');
    expect(mutation.variables).toEqual({ discussionId: 'D_kwDODiscussionNode', body: 'Reply' });
    expect(mutation.query).toContain('addDiscussionComment');
    expect(fetch.mock.calls).toHaveLength(2);
  });

  it.each([
    'https://example.com/repos/org/repo',
    '//example.com/repos/org/repo',
    '/../../login/oauth/access_token',
    '/%2e%2e/login/oauth/access_token',
  ])('rejects unsafe custom REST path %s', async (path) => {
    await expect(customApiCall.input.parseAsync({ method: 'GET', path })).rejects.toThrow(
      'URL must target the GitHub API',
    );
  });

  it('rejects auth overrides and redirects in custom REST calls', async () => {
    await expect(
      customApiCall.input.parseAsync({
        method: 'GET',
        path: '/user',
        headers: { Authorization: 'Bearer stolen' },
      }),
    ).rejects.toThrow('Authentication and transport headers cannot be overridden');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302 })));

    const input = customApiCall.input.parse({ method: 'GET', path: '/user' });

    await expect(
      customApiCall.run({
        client: createGithubClient({ auth }),
        input,
        options: {},
        req: request(),
      }),
    ).rejects.toThrow('redirects are not allowed');
  });

  it('creates and deletes the exact owned hook with a persisted secret', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 123 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetch);

    const client = createGithubClient({ auth });
    const input = labelCreated.input.parse({ repository: { owner: 'org', repo: 'repo' } });
    const state = await labelCreated.onEnable({
      client,
      input,
      webhookUrl: 'https://app.test/hook',
      options: {},
      req: request(),
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);

    expect(state).toMatchObject({ hookId: 123, owner: 'org', repo: 'repo', events: ['label'] });
    expect(state).toHaveProperty('secret', body.config.secret);
    expect(body.config.secret).toMatch(/^[a-f0-9]{64}$/);

    await labelCreated.onDisable({ client, input, state, options: {}, req: request() });

    expect(new URL(String(fetch.mock.calls[1][0])).pathname).toBe('/repos/org/repo/hooks/123');
    expect(fetch.mock.calls[1][1].method).toBe('DELETE');
  });

  it('verifies signatures and filters webhook event and action', async () => {
    const trigger = labelCreated;
    const client = createGithubClient({ auth });
    const delivery = { action: 'created', label: { name: 'bug' } };
    const state = { events: ['label'], hookId: 123, owner: 'org', repo: 'repo', secret: 'secret' };

    const deliveryRequest = (event: string, signatureSecret: string, value: Delivery) =>
      webhookRequest(
        { 'x-github-event': event, 'x-github-delivery': 'delivery' },
        signatureSecret,
        value,
      );

    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: deliveryRequest('label', 'secret', delivery),
      }),
    ).resolves.toEqual([{ data: delivery, dedupeKey: 'delivery:0' }]);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: deliveryRequest('issues', 'secret', delivery),
      }),
    ).resolves.toEqual([]);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: deliveryRequest('label', 'secret', { action: 'edited' }),
      }),
    ).resolves.toEqual([]);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: deliveryRequest('label', 'wrong', delivery),
      }),
    ).rejects.toThrow('signature is invalid');
  });

  it.each([
    {
      trigger: branchCreated,
      event: 'create',
      accepted: { ref_type: 'branch' },
      rejected: { ref_type: 'tag' },
    },
    {
      trigger: collaboratorAdded,
      event: 'member',
      accepted: { action: 'added' },
      rejected: { action: 'removed' },
    },
    {
      trigger: labelCreated,
      event: 'label',
      accepted: { action: 'created' },
      rejected: { action: 'edited' },
    },
    {
      trigger: milestoneCreated,
      event: 'milestone',
      accepted: { action: 'created' },
      rejected: { action: 'closed' },
    },
    {
      trigger: releaseCreated,
      event: 'release',
      accepted: { action: 'created' },
      rejected: { action: 'published' },
    },
    {
      trigger: reviewRequested,
      event: 'pull_request',
      accepted: { action: 'review_requested' },
      rejected: { action: 'opened' },
    },
  ])(
    'filters $trigger.slug by its GitHub event action',
    async ({ trigger, event, accepted, rejected }) => {
      const client = createGithubClient({ auth });
      const state = { events: [event], hookId: 123, owner: 'org', repo: 'repo', secret: 'secret' };
      const deliveryRequest = (value: Delivery) =>
        webhookRequest({ 'x-github-event': event }, state.secret, value);

      await expect(
        trigger.run({
          client,
          input: { repository: { owner: 'org', repo: 'repo' } },
          state,
          options: {},
          req: deliveryRequest(accepted),
        }),
      ).resolves.toHaveLength(1);
      await expect(
        trigger.run({
          client,
          input: { repository: { owner: 'org', repo: 'repo' } },
          state,
          options: {},
          req: deliveryRequest(rejected),
        }),
      ).resolves.toEqual([]);
    },
  );

  it('filters commit pushes and mentions beyond their event names', async () => {
    const commit = commitCreated;
    const mention = mentioned;
    const client = createGithubClient({ auth });
    const deliveryRequest = (event: string, secret: string, value: Delivery) =>
      webhookRequest({ 'x-github-event': event }, secret, value);

    const commitState = {
      events: ['push'],
      hookId: 1,
      owner: 'org',
      repo: 'repo',
      secret: 'commit-secret',
    };
    const push = {
      ref: 'refs/heads/main',
      commits: [
        { id: 'one', distinct: true },
        { id: 'two', distinct: false },
      ],
    };

    const commitHash = createHash('sha256').update(JSON.stringify(push)).digest('hex');

    await expect(
      commit.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state: commitState,
        options: {},
        req: deliveryRequest('push', commitState.secret, push),
      }),
    ).resolves.toEqual([{ data: { id: 'one', distinct: true }, dedupeKey: `${commitHash}:0` }]);
    await expect(
      commit.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state: commitState,
        options: {},
        req: deliveryRequest('push', commitState.secret, { ...push, ref: 'refs/tags/v1' }),
      }),
    ).resolves.toEqual([]);

    const mentionState = {
      events: ['issue_comment', 'pull_request_review_comment'],
      hookId: 2,
      owner: 'org',
      repo: 'repo',
      secret: 'mention-secret',
      username: 'octocat',
    };

    await expect(
      mention.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state: mentionState,
        options: {},
        req: deliveryRequest('issue_comment', mentionState.secret, {
          action: 'created',
          comment: { body: 'Please review, @octocat.' },
        }),
      }),
    ).resolves.toHaveLength(1);
    await expect(
      mention.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state: mentionState,
        options: {},
        req: deliveryRequest('issue_comment', mentionState.secret, {
          action: 'created',
          comment: { body: 'Please ask @octocat-team.' },
        }),
      }),
    ).resolves.toEqual([]);
  });
});
