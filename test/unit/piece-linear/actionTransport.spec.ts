import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceActionDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createLinear } from '../../../packages/pieces/piece-linear/src/index.js';

function request() {
  const auth = { apiKey: 'lin_api_test' };

  return {
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  } as never;
}

afterEach(() => vi.unstubAllGlobals());

describe('Preserved Linear action transport', () => {
  it.each([
    {
      slug: 'createIssue',
      input: { teamId: 'team', title: 'Issue', description: 'Body', labelIds: ['label'] },
      operation: 'IssueCreate',
      variables: {
        input: { teamId: 'team', title: 'Issue', description: 'Body', labelIds: ['label'] },
      },
      resource: 'issue',
    },
    {
      slug: 'updateIssue',
      input: { teamId: 'team', issueId: 'issue', title: 'Updated' },
      operation: 'IssueUpdate',
      variables: { id: 'issue', input: { title: 'Updated' } },
      resource: 'issue',
    },
    {
      slug: 'createProject',
      input: { teamId: 'team', name: 'Project' },
      operation: 'ProjectCreate',
      variables: { input: { teamIds: ['team'], name: 'Project' } },
      resource: 'project',
    },
    {
      slug: 'updateProject',
      input: { teamId: 'team', projectId: 'project', name: 'Updated' },
      operation: 'ProjectUpdate',
      variables: { id: 'project', input: { teamIds: ['team'], name: 'Updated' } },
      resource: 'project',
    },
    {
      slug: 'createComment',
      input: { teamId: 'team', issueId: 'issue', body: 'Comment' },
      operation: 'CommentCreate',
      variables: { input: { issueId: 'issue', body: 'Comment' } },
      resource: 'comment',
    },
  ] as const)(
    'maps $slug to the SDK request',
    async ({ slug, input, operation, variables, resource }) => {
      const fetch = vi.fn().mockImplementation(async () =>
        Response.json({
          data: {
            [`${operation[0]!.toLowerCase()}${operation.slice(1)}`]: {
              success: true,
              lastSyncId: 1,
              [resource]: { id: 'id' },
            },
            [resource]: { id: 'id' },
          },
        }),
      );

      vi.stubGlobal('fetch', fetch);

      const linear = createLinear({ auth: { apiKey: 'lin_api_test' } });

      await linear[slug]({ input, req: request() } as never);

      const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);

      expect(body.query).toContain(operation);
      expect(body.variables).toEqual(variables);
      expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
        'lin_api_test',
      );
    },
  );

  it('passes raw GraphQL query and variables unchanged', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: { viewer: { id: 'user' } } }));

    vi.stubGlobal('fetch', fetch);

    const result = await createLinear({ auth: { apiKey: 'lin_api_test' } }).rawGraphqlQuery({
      input: { query: 'query Viewer { viewer { id } }', variables: { first: 1 } },
      req: request(),
    });

    expect(result).toMatchObject({ data: { viewer: { id: 'user' } }, status: 200 });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      query: 'query Viewer { viewer { id } }',
      variables: { first: 1 },
    });
  });

  it('loads paginated teams and dependent state options through the SDK transport', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            teams: {
              nodes: [{ id: 't1', name: 'One' }],
              pageInfo: { hasNextPage: true, endCursor: 'next' },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            teams: { nodes: [{ id: 't2', name: 'Two' }], pageInfo: { hasNextPage: false } },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            workflowStates: {
              nodes: [{ id: 's1', name: 'Todo' }],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
      );

    vi.stubGlobal('fetch', fetch);

    const linear = createLinear({ auth: { apiKey: 'lin_api_test' } });
    const client = await linear.client({ req: request() });
    const definition = pieceActionDefinition(linear.createIssue)!;
    const context = { client, options: {}, req: request() };

    expect(await definition.options?.teamId?.({ ...context, input: {} })).toEqual([
      { label: 'One', value: 't1' },
      { label: 'Two', value: 't2' },
    ]);
    expect(await definition.options?.stateId?.({ ...context, input: { teamId: 't1' } })).toEqual([
      { label: 'Todo', value: 's1' },
    ]);
    expect(JSON.parse(fetch.mock.calls[1]?.[1]?.body as string).variables.after).toBe('next');
  });
});
