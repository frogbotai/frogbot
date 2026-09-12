import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createLinear,
  linearActions,
  linearTriggers,
} from '../../../packages/pieces/piece-linear/src/index.js';

const req = (auth = { apiKey: 'lin_api_test' }) =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;
const graphQL = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('linear', () => {
  it('exposes the semantic action and trigger slugs', () => {
    const linear = createLinear({ auth: { apiKey: 'lin_api_test' } });
    expect(pieceInstanceTools(linear)?.map(({ slug }) => slug)).toEqual(
      linearActions.map((slug) => `linear_${slug}`),
    );
    expect(Object.keys(linear.triggers)).toEqual(linearTriggers);
  });

  it.each([
    [
      'createIssue',
      { teamId: 'team', title: 'Issue', description: 'Body', labelIds: ['label'] },
      'IssueCreate',
      { input: { teamId: 'team', title: 'Issue', description: 'Body', labelIds: ['label'] } },
    ],
    [
      'updateIssue',
      { teamId: 'team', issueId: 'issue', title: 'Updated' },
      'IssueUpdate',
      { id: 'issue', input: { title: 'Updated' } },
    ],
    [
      'createProject',
      { teamId: 'team', name: 'Project' },
      'ProjectCreate',
      { input: { teamIds: ['team'], name: 'Project' } },
    ],
    [
      'updateProject',
      { teamId: 'team', projectId: 'project', name: 'Updated' },
      'ProjectUpdate',
      { id: 'project', input: { teamIds: ['team'], name: 'Updated' } },
    ],
    [
      'createComment',
      { teamId: 'team', issueId: 'issue', body: 'Comment' },
      'CommentCreate',
      { input: { issueId: 'issue', body: 'Comment' } },
    ],
  ] as const)('maps %s to the SDK request', async (slug, input, operation, variables) => {
    const fetch = vi.fn().mockImplementation(async () =>
      graphQL({
        [`${operation[0]?.toLowerCase()}${operation.slice(1)}`]: {
          success: true,
          lastSyncId: 1,
          issue: { id: 'id' },
          project: { id: 'id' },
          comment: { id: 'id' },
        },
        issue: { id: 'id' },
        project: { id: 'id' },
        comment: { id: 'id' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const linear = createLinear({ auth: { apiKey: 'lin_api_test' } });
    await linear[slug]({ input, req: req() });
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
    expect(body.query).toContain(operation);
    expect(body.variables).toEqual(variables);
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'lin_api_test' });
  });

  it('passes raw GraphQL query and variables unchanged', async () => {
    const fetch = vi.fn().mockResolvedValue(graphQL({ viewer: { id: 'user' } }));
    vi.stubGlobal('fetch', fetch);
    await createLinear({ auth: { apiKey: 'lin_api_test' } }).rawGraphqlQuery({
      input: { query: 'query Viewer { viewer { id } }', variables: { first: 1 } },
      req: req(),
    });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      query: 'query Viewer { viewer { id } }',
      variables: { first: 1 },
    });
  });

  it('loads paginated and dependent options through the SDK transport', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        graphQL({
          teams: {
            nodes: [{ id: 't1', name: 'One' }],
            pageInfo: { hasNextPage: true, endCursor: 'next' },
          },
        }),
      )
      .mockResolvedValueOnce(
        graphQL({
          teams: { nodes: [{ id: 't2', name: 'Two' }], pageInfo: { hasNextPage: false } },
        }),
      )
      .mockResolvedValueOnce(
        graphQL({
          workflowStates: { nodes: [{ id: 's1', name: 'Todo' }], pageInfo: { hasNextPage: false } },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const linear = createLinear({ auth: { apiKey: 'lin_api_test' } });
    const client = await linear.client({ req: req() });
    const definition = pieceActionDefinition(linear.createIssue)!;
    expect(
      await definition.options?.teamId?.({ input: {}, client, options: {}, req: req() }),
    ).toEqual([
      { label: 'One', value: 't1' },
      { label: 'Two', value: 't2' },
    ]);
    expect(
      await definition.options?.stateId?.({
        input: { teamId: 't1' },
        client,
        options: {},
        req: req(),
      }),
    ).toEqual([{ label: 'Todo', value: 's1' }]);
  });

  it.each(linearTriggers)('registers, filters, and removes %s', async (slug) => {
    const definition = pieceFactoryDefinition(createLinear).triggers?.find(
      (trigger) => trigger.slug === slug,
    );
    if (!definition) throw new Error(`Missing trigger '${slug}'.`);
    const client = {
      createWebhook: vi
        .fn()
        .mockResolvedValue({ success: true, webhook: Promise.resolve({ id: 'hook' }) }),
      deleteWebhook: vi.fn(),
    };
    const input = definition.input.parse(slug.startsWith('issue') ? { teamId: 'team' } : {});
    if (definition.type !== 'webhook') throw new Error(`Trigger '${slug}' is not a webhook.`);
    const state = await definition.onEnable({
      client,
      input,
      webhookUrl: 'https://example.com/hook',
      options: {},
      req: req(),
    } as never);
    expect(client.createWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/hook' }),
    );
    const action = slug.endsWith('Created')
      ? 'create'
      : slug.endsWith('Updated')
        ? 'update'
        : 'remove';
    const delivery = { action, data: {}, updatedFrom: { statusId: 'status' } };
    await expect(
      definition.run({ client, input, options: {}, req: { data: delivery } } as never),
    ).resolves.toEqual([delivery]);
    await definition.onDisable({ client, input, state, options: {}, req: req() } as never);
    expect(client.deleteWebhook).toHaveBeenCalledWith('hook');
  });
});
