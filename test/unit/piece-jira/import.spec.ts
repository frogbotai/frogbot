import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createJira } from '../../../packages/pieces/piece-jira/src/index.js';
import { agile, api, body, calls, json, req, site, stubJira } from './fixtures.js';

const jira = createJira({ siteUrl: site });

type ListAction = (args: { input: object; req: unknown }) => Promise<{
  data: unknown[];
  pagination: { count: number; hasMore: boolean; nextCursor: string | null; limit: number };
}>;

function list(slug: string) {
  return (jira as unknown as Record<string, ListAction>)[slug];
}

function query(index = 0) {
  return Object.fromEntries(new URL(calls[index].url).searchParams);
}

function path(index = 0) {
  const url = new URL(calls[index].url);

  return `${url.origin}${url.pathname}`;
}

afterEach(() => vi.unstubAllGlobals());

describe('Jira import lists', () => {
  it.each([
    [
      'listProjects',
      {},
      `${api}/project/search`,
      { expand: 'description,lead' },
      { id: '1', key: 'OPS', name: 'Ops' },
    ],
    [
      'listStatuses',
      { projectId: '10' },
      `${api}/statuses/search`,
      { projectId: '10' },
      { id: '1', name: 'To Do' },
    ],
    ['listPriorities', {}, `${api}/priority/search`, {}, { id: '3', name: 'Medium' }],
    [
      'listFields',
      {},
      `${api}/field/search`,
      { expand: 'key' },
      {
        id: 'customfield_10020',
        name: 'Sprint',
        schema: { type: 'array', items: 'json', custom: 'com.pyxis.greenhopper.jira:gh-sprint' },
      },
    ],
    [
      'listVersions',
      { projectId: 'OPS' },
      `${api}/project/OPS/version`,
      {},
      { id: '1', name: 'v1' },
    ],
    [
      'listComponents',
      { projectId: 'OPS' },
      `${api}/project/OPS/component`,
      {},
      { id: '1', name: 'API' },
    ],
    [
      'listBoards',
      { projectId: 'OPS' },
      `${agile}/board`,
      { projectKeyOrId: 'OPS' },
      { id: 1, name: 'Ops board' },
    ],
    [
      'listSprints',
      { boardId: 1, state: ['active', 'closed'] },
      `${agile}/board/1/sprint`,
      { state: 'active,closed' },
      { id: 5, name: 'Sprint 5', state: 'active' },
    ],
  ])('%s pages values by startAt', async (slug, input, url, extra, record) => {
    stubJira(() => json({ values: [record], startAt: 0, maxResults: 2, isLast: false }));

    const first = await list(slug)({ input: { ...input, limit: 2 }, req: req() });

    expect(path()).toBe(url);
    expect(query()).toEqual({ ...extra, startAt: '0', maxResults: '2' });
    expect(first).toEqual({
      data: [record],
      pagination: { count: 1, hasMore: true, nextCursor: '1', limit: 2 },
    });

    stubJira(() => json({ values: [record], startAt: 1, maxResults: 2, isLast: true }));

    const last = await list(slug)({ input: { ...input, limit: 2, cursor: '1' }, req: req() });

    expect(query()).toMatchObject({ startAt: '1' });
    expect(last.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 2 });
  });

  it('listComments and listWorklogs page by startAt and total', async () => {
    stubJira((call) =>
      call.url.includes('/comment')
        ? json({
            comments: [
              { id: '1', body: {} },
              { id: '2', body: {} },
            ],
            startAt: 0,
            maxResults: 2,
            total: 3,
          })
        : json({ worklogs: [{ id: '9' }], startAt: 2, maxResults: 2, total: 3 }),
    );

    const comments = await jira.listComments({
      input: { issueKey: 'OPS-1', limit: 2 },
      req: req(),
    });

    const worklogs = await jira.listWorklogs({
      input: { issueKey: 'OPS-1', limit: 2, cursor: '2' },
      req: req(),
    });

    expect(path(0)).toBe(`${api}/issue/OPS-1/comment`);
    expect(query(0)).toEqual({
      orderBy: '-created',
      expand: 'renderedBody',
      startAt: '0',
      maxResults: '2',
    });
    expect(comments.pagination).toEqual({ count: 2, hasMore: true, nextCursor: '2', limit: 2 });
    expect(path(1)).toBe(`${api}/issue/OPS-1/worklog`);
    expect(query(1)).toEqual({ startAt: '2', maxResults: '2' });
    expect(worklogs.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 2 });
  });

  it('listUsers pages a bare array until a short page', async () => {
    stubJira(() => json([{ accountId: 'a' }, { accountId: 'b' }]));

    const full = await jira.listUsers({ input: { limit: 2 }, req: req() });

    expect(path()).toBe(`${api}/users/search`);
    expect(full.pagination).toEqual({ count: 2, hasMore: true, nextCursor: '2', limit: 2 });

    stubJira(() => json([{ accountId: 'c' }]));

    const last = await jira.listUsers({ input: { limit: 2, cursor: '2' }, req: req() });

    expect(query()).toEqual({ startAt: '2', maxResults: '2' });
    expect(last.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 2 });
  });

  it.each([
    ['listIssueTypes', {}, `${api}/issuetype`, (items: object[]) => items],
    ['listIssueTypes', { projectId: '10' }, `${api}/issuetype/project`, (items: object[]) => items],
    [
      'listIssueLinkTypes',
      {},
      `${api}/issueLinkType`,
      (items: object[]) => ({ issueLinkTypes: items }),
    ],
    [
      'listWatchers',
      { issueKey: 'OPS-1' },
      `${api}/issue/OPS-1/watchers`,
      (items: object[]) => ({ watchers: items }),
    ],
  ])('%s pages a list Jira returns whole by offset', async (slug, input, url, wrap) => {
    const items =
      slug === 'listWatchers'
        ? [{ accountId: 'a' }, { accountId: 'b' }, { accountId: 'c' }]
        : slug === 'listIssueLinkTypes'
          ? ['1', '2', '3'].map((id) => ({ id, name: id, inward: id, outward: id }))
          : ['1', '2', '3'].map((id) => ({ id, name: id }));

    stubJira(() => json(wrap(items)));

    const first = await list(slug)({ input: { ...input, limit: 2 }, req: req() });

    expect(path()).toBe(url);
    expect(first.data).toEqual(items.slice(0, 2));
    expect(first.pagination).toEqual({ count: 2, hasMore: true, nextCursor: '2', limit: 2 });

    const last = await list(slug)({ input: { ...input, limit: 2, cursor: '2' }, req: req() });

    expect(last.data).toEqual(items.slice(2));
    expect(last.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 2 });
  });

  it('refuses a cursor that is not an offset', async () => {
    stubJira(() => json({ values: [] }));

    await expect(jira.listProjects({ input: { cursor: 'abc' }, req: req() })).rejects.toThrow(
      "Jira cursor 'abc' is not a page offset.",
    );
    expect(calls).toEqual([]);
  });

  it.each([0, 101])('refuses a limit of %s', async (limit) => {
    stubJira(() => json({ values: [] }));

    await expect(jira.listProjects({ input: { limit }, req: req() })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('defaults the limit to 50', async () => {
    stubJira(() => json({ values: [], isLast: true }));

    await expect(jira.listPriorities({ input: {}, req: req() })).resolves.toEqual({
      data: [],
      pagination: { count: 0, hasMore: false, nextCursor: null, limit: 50 },
    });
    expect(query()).toEqual({ startAt: '0', maxResults: '50' });
  });
});

describe('Jira token-paged reads', () => {
  it('searchIssues sends fields and expand, and continues from nextPageToken', async () => {
    stubJira((call) =>
      body(call).nextPageToken
        ? json({ issues: [{ id: '2', key: 'OPS-2' }], isLast: true })
        : json({ issues: [{ id: '1', key: 'OPS-1' }], nextPageToken: 'page-2' }),
    );

    const first = await jira.searchIssues({
      input: { jql: 'project = OPS', fields: ['summary', ' '], expand: ['changelog'], limit: 1 },
      req: req(),
    });

    expect(calls[0]?.url).toBe(`${api}/search/jql`);
    expect(body(calls[0])).toEqual({
      jql: 'project = OPS',
      maxResults: 1,
      fields: ['summary'],
      expand: 'changelog',
    });
    expect(first.pagination).toEqual({ count: 1, hasMore: true, nextCursor: 'page-2', limit: 1 });

    const last = await jira.searchIssues({
      input: { jql: 'project = OPS', limit: 1, cursor: 'page-2' },
      req: req(),
    });

    expect(body(calls[1])).toEqual({
      jql: 'project = OPS',
      maxResults: 1,
      fields: ['*navigable'],
      nextPageToken: 'page-2',
    });
    expect(last.data).toEqual([{ id: '2', key: 'OPS-2' }]);
    expect(last.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 1 });
  });

  it('searchIssues sanitizes on request and maps field names', async () => {
    stubJira((call) =>
      call.url.endsWith('/jql/sanitize')
        ? json({ queries: [{ sanitizedQuery: 'assignee = "acc-1"' }] })
        : json({
            issues: [{ id: '1', key: 'OPS-1', fields: { customfield_1: 5 } }],
            names: { customfield_1: 'Story points' },
          }),
    );

    const result = await jira.searchIssues({
      input: { jql: 'assignee = dana', sanitizeJql: true, mapNames: true },
      req: req(),
    });

    expect(body(calls[0])).toEqual({ queries: [{ query: 'assignee = dana' }] });
    expect(body(calls[1])).toMatchObject({ jql: 'assignee = "acc-1"', expand: 'names' });
    expect(result.data).toEqual([{ id: '1', key: 'OPS-1', fields: { 'Story points': 5 } }]);
    expect(result.pagination.nextCursor).toBeNull();
  });

  it('listChangelogs posts the keys and continues from nextPageToken', async () => {
    const history = {
      issueId: '10001',
      changeHistories: [
        {
          id: '1',
          created: '2026-11-01T10:00:00.000+0000',
          items: [{ field: 'status', fromString: 'To Do', toString: 'Done' }],
        },
      ],
    };

    stubJira(() => json({ issueChangeLogs: [history], nextPageToken: 'next' }));

    const result = await jira.listChangelogs({
      input: { issueKeys: ['OPS-1', 'OPS-2'], fieldIds: ['status'], limit: 10, cursor: 'prev' },
      req: req(),
    });

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(`${api}/changelog/bulkfetch`);
    expect(body(calls[0])).toEqual({
      issueIdsOrKeys: ['OPS-1', 'OPS-2'],
      fieldIds: ['status'],
      maxResults: 10,
      nextPageToken: 'prev',
    });
    expect(result).toEqual({
      data: [history],
      pagination: { count: 1, hasMore: true, nextCursor: 'next', limit: 10 },
    });
  });

  it.each([0, 1001])('listChangelogs refuses %s keys', async (count) => {
    stubJira(() => json({ issueChangeLogs: [] }));

    await expect(
      jira.listChangelogs({
        input: { issueKeys: Array.from({ length: count }, (_, index) => `OPS-${index}`) },
        req: req(),
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('listChangelogs takes 1,000 keys', async () => {
    stubJira(() => json({ issueChangeLogs: [] }));

    await jira.listChangelogs({
      input: { issueKeys: Array.from({ length: 1000 }, (_, index) => `OPS-${index}`) },
      req: req(),
    });

    expect(body(calls[0]).issueIdsOrKeys).toHaveLength(1000);
  });
});
