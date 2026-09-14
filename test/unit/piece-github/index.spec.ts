import { createHash, createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createGithubClient } from '../../../packages/pieces/piece-github/src/client.js';
import {
  createGithub,
  githubActions,
  githubTriggers,
} from '../../../packages/pieces/piece-github/src/index.js';

const auth = { accessToken: 'github-token' };

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('github', () => {
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

    const account = pieceFactoryDefinition(createGithub).oauth?.account;
    if (!account) throw new Error('Missing GitHub account lookup.');

    await expect(
      account({
        tokens: { access_token: 'stored-token' },
        client: createGithubClient({ auth: { accessToken: 'stored-token' } }),
        req: undefined,
      }),
    ).resolves.toEqual({ id: '42', label: 'octocat', email: 'private@example.com' });
    expect(new Headers(fetch.mock.calls[1][1].headers).get('authorization')).toBe(
      'Bearer stored-token',
    );
  });

  it('maps action inputs and validates action responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ id: 10, number: 7, title: 'Bug', body: 'Details' }));

    vi.stubGlobal('fetch', fetch);

    const action = pieceFactoryDefinition(createGithub).actions.find(
      (value) => value.slug === 'createIssue',
    );
    if (!action) throw new Error('Missing createIssue action.');

    const client = createGithubClient({ auth });
    const input = action.input.parse({
      repository: { owner: 'frogbotai', repo: 'frogbot' },
      title: 'Bug',
      description: 'Details',
      labels: ['bug'],
      assignees: ['octocat'],
    });
    const result = await action.run({ client, input, options: {}, req: undefined });

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

    await expect(action.run({ client, input, options: {}, req: undefined })).rejects.toThrow();
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

    const definition = pieceFactoryDefinition(createGithub).actions.find(
      (value) => value.slug === 'createBranch',
    );
    if (!definition) throw new Error('Missing createBranch action.');

    const client = createGithubClient({ auth });
    const options = definition.options?.sourceBranch;
    if (!options) throw new Error('Missing branch options.');

    await expect(
      options({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        options: {},
        req: undefined,
      }),
    ).resolves.toHaveLength(100);

    const input = definition.input.parse({
      repository: { owner: 'org', repo: 'repo' },
      sourceBranch: 'main',
      newBranchName: 'feature',
    });

    await definition.run({ client, input, options: {}, req: undefined });

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

    const action = pieceFactoryDefinition(createGithub).actions.find(
      (value) => value.slug === 'createDiscussionComment',
    );
    if (!action) throw new Error('Missing createDiscussionComment action.');

    const input = action.input.parse({
      repository: { owner: 'org', repo: 'repo' },
      discussionNumber: 12,
      body: 'Reply',
    });

    await action.run({ client: createGithubClient({ auth }), input, options: {}, req: undefined });

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
    const action = pieceFactoryDefinition(createGithub).actions.find(
      (value) => value.slug === 'customApiCall',
    );
    if (!action) throw new Error('Missing customApiCall action.');

    await expect(action.input.parseAsync({ method: 'GET', path })).rejects.toThrow(
      'URL must target the GitHub API',
    );
  });

  it('rejects auth overrides and redirects in custom REST calls', async () => {
    const action = pieceFactoryDefinition(createGithub).actions.find(
      (value) => value.slug === 'customApiCall',
    );
    if (!action) throw new Error('Missing customApiCall action.');

    await expect(
      action.input.parseAsync({
        method: 'GET',
        path: '/user',
        headers: { Authorization: 'Bearer stolen' },
      }),
    ).rejects.toThrow('Authentication and transport headers cannot be overridden');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302 })));

    const input = action.input.parse({ method: 'GET', path: '/user' });

    await expect(
      action.run({
        client: createGithubClient({ auth }),
        input,
        options: {},
        req: { signal: undefined },
      }),
    ).rejects.toThrow('redirects are not allowed');
  });

  it('creates and deletes the exact owned hook with a persisted secret', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 123 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetch);

    const trigger = pieceFactoryDefinition(createGithub).triggers?.find(
      (value) => value.slug === 'labelCreated',
    );
    if (!trigger || trigger.type !== 'webhook') throw new Error('Missing labelCreated webhook.');

    const client = createGithubClient({ auth });
    const input = trigger.input.parse({ repository: { owner: 'org', repo: 'repo' } });
    const state = await trigger.onEnable({
      client,
      input,
      webhookUrl: 'https://app.test/hook',
      options: {},
      req: undefined,
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);

    expect(state).toMatchObject({ hookId: 123, owner: 'org', repo: 'repo', events: ['label'] });
    expect(body.config.secret).toBe(state.secret);
    expect(body.config.secret).toMatch(/^[a-f0-9]{64}$/);

    await trigger.onDisable({ client, input, state, options: {}, req: undefined });

    expect(new URL(String(fetch.mock.calls[1][0])).pathname).toBe('/repos/org/repo/hooks/123');
    expect(fetch.mock.calls[1][1].method).toBe('DELETE');
  });

  it('verifies signatures and filters webhook event and action', async () => {
    const trigger = pieceFactoryDefinition(createGithub).triggers?.find(
      (value) => value.slug === 'labelCreated',
    );
    if (!trigger || trigger.type !== 'webhook') throw new Error('Missing labelCreated webhook.');

    const client = createGithubClient({ auth });
    const delivery = { action: 'created', label: { name: 'bug' } };
    const state = { events: ['label'], hookId: 123, owner: 'org', repo: 'repo', secret: 'secret' };

    function request(event: string, signatureSecret: string, value: unknown) {
      const body = JSON.stringify(value);

      return {
        arrayBuffer: async () => Buffer.from(body),
        data: value,
        headers: new Headers({
          'x-github-event': event,
          'x-github-delivery': 'delivery',
          'x-hub-signature-256': `sha256=${createHmac('sha256', signatureSecret).update(body).digest('hex')}`,
        }),
      };
    }

    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: request('label', 'secret', delivery),
      }),
    ).resolves.toEqual([{ data: delivery, dedupeKey: 'delivery:0' }]);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: request('issues', 'secret', delivery),
      }),
    ).resolves.toEqual([]);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: request('label', 'secret', { action: 'edited' }),
      }),
    ).resolves.toEqual([]);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: request('label', 'wrong', delivery),
      }),
    ).rejects.toThrow('signature is invalid');
  });

  it.each([
    ['branchCreated', 'create', { ref_type: 'branch' }, { ref_type: 'tag' }],
    ['collaboratorAdded', 'member', { action: 'added' }, { action: 'removed' }],
    ['labelCreated', 'label', { action: 'created' }, { action: 'edited' }],
    ['milestoneCreated', 'milestone', { action: 'created' }, { action: 'closed' }],
    ['releaseCreated', 'release', { action: 'created' }, { action: 'published' }],
    ['reviewRequested', 'pull_request', { action: 'review_requested' }, { action: 'opened' }],
  ])('filters %s by its GitHub event action', async (slug, event, accepted, rejected) => {
    const trigger = pieceFactoryDefinition(createGithub).triggers?.find(
      (value) => value.slug === slug,
    );
    if (!trigger || trigger.type !== 'webhook') throw new Error(`Missing ${slug} webhook.`);

    const client = createGithubClient({ auth });
    const state = { events: [event], hookId: 123, owner: 'org', repo: 'repo', secret: 'secret' };

    function request(value: unknown) {
      const body = JSON.stringify(value);

      return {
        arrayBuffer: async () => Buffer.from(body),
        data: value,
        headers: new Headers({
          'x-github-event': event,
          'x-hub-signature-256': `sha256=${createHmac('sha256', state.secret).update(body).digest('hex')}`,
        }),
      };
    }

    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: request(accepted),
      }),
    ).resolves.toHaveLength(1);
    await expect(
      trigger.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state,
        options: {},
        req: request(rejected),
      }),
    ).resolves.toEqual([]);
  });

  it('filters commit pushes and mentions beyond their event names', async () => {
    const definitions = pieceFactoryDefinition(createGithub).triggers;
    const commit = definitions?.find((value) => value.slug === 'commitCreated');
    const mention = definitions?.find((value) => value.slug === 'mentioned');
    if (!commit || commit.type !== 'webhook' || !mention || mention.type !== 'webhook') {
      throw new Error('Missing commit or mention webhook.');
    }

    const client = createGithubClient({ auth });

    function request(event: string, secret: string, value: unknown) {
      const body = JSON.stringify(value);

      return {
        arrayBuffer: async () => Buffer.from(body),
        data: value,
        headers: new Headers({
          'x-github-event': event,
          'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
        }),
      };
    }

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
        req: request('push', commitState.secret, push),
      }),
    ).resolves.toEqual([{ data: { id: 'one', distinct: true }, dedupeKey: `${commitHash}:0` }]);
    await expect(
      commit.run({
        client,
        input: { repository: { owner: 'org', repo: 'repo' } },
        state: commitState,
        options: {},
        req: request('push', commitState.secret, { ...push, ref: 'refs/tags/v1' }),
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
        req: request('issue_comment', mentionState.secret, {
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
        req: request('issue_comment', mentionState.secret, {
          action: 'created',
          comment: { body: 'Please ask @octocat-team.' },
        }),
      }),
    ).resolves.toEqual([]);
  });
});
