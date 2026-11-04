import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createJira, jiraActions } from '../../../packages/pieces/piece-jira/src/index.js';
import {
  api,
  basic,
  body,
  type Call,
  calls,
  filesReq,
  json,
  oauth,
  req,
  site,
  stubJira,
} from './fixtures.js';

const jira = createJira({ siteUrl: site });
const issueBody = { id: '10001', key: 'OPS-1', fields: { summary: 'Fix it' } };
const adf = (text: string) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

function sent(call: Call | undefined) {
  return { method: call?.method, url: call?.url, body: call?.body ? body(call) : undefined };
}

afterEach(() => vi.unstubAllGlobals());

describe('Jira actions', () => {
  it('registers the upstream actions and a custom API call', () => {
    const definition = pieceFactoryDefinition(createJira);

    expect(definition).toMatchObject({
      slug: 'jira',
      label: 'Jira',
      admin: { group: 'Productivity' },
    });
    expect(definition.actions.map((action) => action.slug)).toEqual([...jiraActions]);
  });

  it('createIssue posts the fields, then reads the new issue', async () => {
    stubJira((call) =>
      call.method === 'POST' ? json({ id: '10001', key: 'OPS-1' }, 201) : json(issueBody),
    );

    const result = await jira.createIssue({
      input: {
        projectId: 'OPS',
        issueTypeId: '10002',
        summary: 'Fix it',
        description: 'Details',
        assignee: 'acc-1',
        priority: '3',
        parentKey: 'OPS-0',
        labels: ['ops'],
        fields: { customfield_10016: 3 },
      },
      req: req(),
    });

    expect(sent(calls[0])).toEqual({
      method: 'POST',
      url: `${api}/issue`,
      body: {
        fields: {
          project: { key: 'OPS' },
          issuetype: { id: '10002' },
          summary: 'Fix it',
          description: adf('Details'),
          assignee: { accountId: 'acc-1' },
          priority: { id: '3' },
          parent: { key: 'OPS-0' },
          labels: ['ops'],
          customfield_10016: 3,
        },
      },
    });
    expect(calls[0]?.headers.get('authorization')).toBe(basic);
    expect(sent(calls[1])).toMatchObject({ method: 'GET', url: `${api}/issue/10001` });
    expect(result).toEqual(issueBody);
  });

  it('createIssue sends a numeric project as an id', async () => {
    stubJira((call) => (call.method === 'POST' ? json({ id: '10001' }, 201) : json(issueBody)));

    await jira.createIssue({
      input: { projectId: '10000', issueTypeId: '1', summary: 'A' },
      req: req(),
    });

    expect(body(calls[0]).fields.project).toEqual({ id: '10000' });
  });

  it('updateIssue runs the transition, then puts the fields and returns the issue', async () => {
    stubJira((call) => (call.method === 'POST' ? json(null, 204) : json(issueBody)));

    await jira.updateIssue({
      input: { issueKey: 'OPS-1', transitionId: '31', issueTypeId: '5', summary: 'New' },
      req: req(),
    });

    expect(calls.map(sent)).toEqual([
      { method: 'POST', url: `${api}/issue/OPS-1/transitions`, body: { transition: { id: '31' } } },
      {
        method: 'PUT',
        url: `${api}/issue/OPS-1?returnIssue=true`,
        body: { fields: { issuetype: { id: '5' }, summary: 'New' } },
      },
    ]);
  });

  it('updateIssue with only a transition reads the issue back', async () => {
    stubJira((call) => (call.method === 'POST' ? json(null, 204) : json(issueBody)));

    await jira.updateIssue({ input: { issueKey: 'OPS-1', transitionId: '31' }, req: req() });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `POST ${api}/issue/OPS-1/transitions`,
      `GET ${api}/issue/OPS-1`,
    ]);
  });

  it('getIssue expands, maps field names and keys transitions by name', async () => {
    stubJira(() =>
      json({
        ...issueBody,
        fields: { summary: 'Fix it', customfield_1: 5 },
        names: { summary: 'Summary', customfield_1: 'Story points' },
        transitions: [{ id: '31', name: 'Done' }],
      }),
    );

    const result = await jira.getIssue({
      input: { issueKey: 'OPS-1', expand: ['transitions'], mapNames: true, mapTransitions: true },
      req: req(),
    });

    expect(calls[0]?.url).toBe(`${api}/issue/OPS-1?expand=transitions%2Cnames`);
    expect(result.fields).toEqual({ Summary: 'Fix it', 'Story points': 5 });
    expect(result.transitions).toEqual({ Done: { id: '31', name: 'Done' } });
  });

  it('searchIssues sanitizes the JQL and follows nextPageToken', async () => {
    stubJira((call) => {
      if (call.url.endsWith('/jql/sanitize')) {
        return json({ queries: [{ sanitizedQuery: 'project = "OPS"' }] });
      }

      return body(call).nextPageToken
        ? json({ issues: [{ id: '2', key: 'OPS-2' }] })
        : json({ issues: [{ id: '1', key: 'OPS-1' }], nextPageToken: 'page-2' });
    });

    const result = await jira.searchIssues({
      input: { jql: 'project = OPS', maxResults: 150, fields: ['summary', ' '] },
      req: req(),
    });

    expect(calls.map(sent)).toEqual([
      {
        method: 'POST',
        url: `${api}/jql/sanitize`,
        body: { queries: [{ query: 'project = OPS' }] },
      },
      {
        method: 'POST',
        url: `${api}/search/jql`,
        body: { jql: 'project = "OPS"', maxResults: 100, fields: ['summary'] },
      },
      {
        method: 'POST',
        url: `${api}/search/jql`,
        body: {
          jql: 'project = "OPS"',
          maxResults: 100,
          fields: ['summary'],
          nextPageToken: 'page-2',
        },
      },
    ]);
    expect(result.map((item) => item.key)).toEqual(['OPS-1', 'OPS-2']);
  });

  it('searchIssues stops at maxResults and maps names', async () => {
    stubJira(() =>
      json({
        issues: [{ id: '1', key: 'OPS-1', fields: { customfield_1: 5 } }],
        names: { customfield_1: 'Story points' },
        nextPageToken: 'more',
      }),
    );

    const result = await jira.searchIssues({
      input: { jql: 'project = OPS', maxResults: 1, sanitizeJql: false, mapNames: true },
      req: req(),
    });

    expect(calls.map(sent)).toEqual([
      {
        method: 'POST',
        url: `${api}/search/jql`,
        body: { jql: 'project = OPS', maxResults: 1, fields: ['*navigable'], expand: 'names' },
      },
    ]);
    expect(result).toEqual([{ id: '1', key: 'OPS-1', fields: { 'Story points': 5 } }]);
  });

  it.each([
    [
      'assignIssue',
      { issueKey: 'OPS-1', assignee: 'acc-1' },
      { method: 'PUT', url: `${api}/issue/OPS-1/assignee`, body: { accountId: 'acc-1' } },
      { success: true },
    ],
    [
      'transitionIssue',
      { issueKey: 'OPS-1', transitionId: '31', comment: 'Done' },
      {
        method: 'POST',
        url: `${api}/issue/OPS-1/transitions`,
        body: {
          transition: { id: '31' },
          update: { comment: [{ add: { body: adf('Done') } }] },
        },
      },
      { success: true, issue: issueBody },
    ],
    [
      'findUser',
      { keyword: 'dana' },
      { method: 'GET', url: `${api}/user/search?query=dana`, body: undefined },
      { found: true, data: [{ accountId: 'acc-1' }] },
    ],
    [
      'addComment',
      { issueKey: 'OPS-1', body: 'Hi' },
      { method: 'POST', url: `${api}/issue/OPS-1/comment`, body: { body: adf('Hi') } },
      { id: '10', body: {} },
    ],
    [
      'updateComment',
      { issueKey: 'OPS-1', commentId: '10', body: 'Edited' },
      { method: 'PUT', url: `${api}/issue/OPS-1/comment/10`, body: { body: adf('Edited') } },
      { id: '10', body: {} },
    ],
    [
      'deleteComment',
      { issueKey: 'OPS-1', commentId: '10' },
      { method: 'DELETE', url: `${api}/issue/OPS-1/comment/10`, body: undefined },
      { success: true },
    ],
    [
      'listComments',
      { issueKey: 'OPS-1' },
      {
        method: 'GET',
        url: `${api}/issue/OPS-1/comment?orderBy=-created&maxResults=10&expand=renderedBody`,
        body: undefined,
      },
      { comments: [], startAt: 0, maxResults: 10, total: 0 },
    ],
    [
      'getAttachment',
      { attachmentId: '20' },
      { method: 'GET', url: `${api}/attachment/20`, body: undefined },
      { id: '20', filename: 'a.txt' },
    ],
    [
      'addWatcher',
      { issueKey: 'OPS-1', accountId: 'acc-1' },
      { method: 'POST', url: `${api}/issue/OPS-1/watchers`, body: 'acc-1' },
      { success: true },
    ],
    [
      'linkIssues',
      { firstIssueKey: 'OPS-1', linkTypeId: '1000', secondIssueKey: '10002' },
      {
        method: 'POST',
        url: `${api}/issueLink`,
        body: {
          type: { id: '1000' },
          outwardIssue: { key: 'OPS-1' },
          inwardIssue: { id: '10002' },
        },
      },
      { success: true },
    ],
  ] as const)('%s sends its request', async (slug, input, request, result) => {
    stubJira((call) => {
      if (call.method === 'GET' && call.url.endsWith('/issue/OPS-1')) return json(issueBody);
      if (slug === 'findUser') return json([{ accountId: 'acc-1' }]);
      if (slug === 'listComments') {
        return json({ comments: [], startAt: 0, maxResults: 10, total: 0 });
      }

      if (slug === 'getAttachment') return json({ id: 20, filename: 'a.txt' });
      if (slug === 'addComment' || slug === 'updateComment') return json({ id: '10', body: {} });

      return json(null, 204);
    });

    const action = jira[slug] as (args: { input: unknown; req: unknown }) => Promise<unknown>;

    await expect(action({ input, req: req() })).resolves.toEqual(result);
    expect(sent(calls[0])).toEqual(request);
    expect(calls[0]?.headers.get('authorization')).toBe(basic);
  });

  it('addAttachment uploads a FrogBot file as multipart with the no-check header', async () => {
    const { req: request, findByID } = filesReq();

    findByID.mockResolvedValue({
      id: 'f1',
      url: '/api/files/file/log.txt',
      filename: 'log.txt',
      mimeType: 'text/plain',
    });

    stubJira((call) =>
      call.url.startsWith('https://app.test/')
        ? new Response('log body')
        : json([{ id: '30', filename: 'log.txt' }]),
    );

    const result = await jira.addAttachment({
      input: { issueKey: 'OPS-1', file: { fileId: 'f1' } },
      req: request,
    });

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        id: 'f1',
        overrideAccess: false,
        req: request,
      }),
    );
    expect(calls[0]?.headers.get('cookie')).toBe('session=1');

    const upload = calls[1];
    const form = upload.raw as FormData;
    const file = form.get('file') as File;

    expect(upload.method).toBe('POST');
    expect(upload.url).toBe(`${api}/issue/OPS-1/attachments`);
    expect(upload.headers.get('x-atlassian-token')).toBe('no-check');
    expect(upload.headers.get('content-type')).toBeNull();
    expect(file.name).toBe('log.txt');
    expect(await file.text()).toBe('log body');
    expect(result).toEqual([{ id: '30', filename: 'log.txt' }]);
  });
});

describe('Jira actions over OAuth', () => {
  const resources = 'https://api.atlassian.com/oauth/token/accessible-resources';
  const ex = 'https://api.atlassian.com/ex/jira/cloud-a/rest/api/3';

  function route(call: Call) {
    if (call.url === resources) return json([{ id: 'cloud-a', url: site, name: 'acme' }]);

    return call.method === 'POST' ? json({ id: '10001' }, 201) : json(issueBody);
  }

  it('getIssue calls the cloud API with the Bearer token', async () => {
    stubJira(route);

    await createJira({}).getIssue({ input: { issueKey: 'OPS-1' }, req: req(oauth) });

    expect(calls[1]?.url).toBe(`${ex}/issue/OPS-1`);
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer atlassian-token');
  });

  it('customApiCall signs requests under the cloud API, and only REST paths', async () => {
    stubJira(route);

    const jira = createJira({});

    await jira.customApiCall({
      input: { method: 'GET', path: '/rest/agile/1.0/board' },
      req: req(oauth),
    });

    expect(calls[1]?.url).toBe('https://api.atlassian.com/ex/jira/cloud-a/rest/agile/1.0/board');
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer atlassian-token');

    await expect(
      jira.customApiCall({
        input: { method: 'GET', path: '/wiki/rest/api/space' },
        req: req(oauth),
      }),
    ).rejects.toThrow("Jira custom API path '/wiki/rest/api/space' is not allowed.");
  });

  it('createIssue posts to the cloud API', async () => {
    stubJira(route);

    await createJira({}).createIssue({
      input: { projectId: 'OPS', issueTypeId: '1', summary: 'A' },
      req: req(oauth),
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${resources}`,
      `POST ${ex}/issue`,
      `GET ${ex}/issue/10001`,
    ]);
  });
});

describe('Jira action options', () => {
  const definition = pieceFactoryDefinition(createJira);

  async function options(slug: string, key: string, input: Record<string, unknown> = {}) {
    const action = definition.actions.find((entry) => entry.slug === slug);
    const load = (action?.options as Record<string, (args: object) => Promise<unknown>>)[key];
    const request = req();

    return load({ input, client: await jira.client({ req: request }), options: {}, req: request });
  }

  it('lists projects over every page', async () => {
    stubJira((call) =>
      new URL(call.url).searchParams.get('startAt') === '0'
        ? json({ values: [{ id: '1', key: 'OPS', name: 'Ops' }], isLast: false })
        : json({ values: [{ id: '2', key: 'WEB', name: 'Web' }], isLast: true }),
    );

    await expect(options('createIssue', 'projectId')).resolves.toEqual([
      { label: 'Ops (OPS)', value: '1' },
      { label: 'Web (WEB)', value: '2' },
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      `${api}/project/search?startAt=0&maxResults=100`,
      `${api}/project/search?startAt=100&maxResults=100`,
    ]);
  });

  it("lists a project's issue types, and none without a project", async () => {
    stubJira(() => json({ issueTypes: [{ id: '1', name: 'Bug' }] }));

    await expect(options('createIssue', 'issueTypeId')).resolves.toEqual([]);
    await expect(options('createIssue', 'issueTypeId', { projectId: '10' })).resolves.toEqual([
      { label: 'Bug', value: '1' },
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      `${api}/issue/createmeta/10/issuetypes?maxResults=100`,
    ]);
  });

  it('lists the recently updated issues', async () => {
    stubJira(() => json({ issues: [{ id: '1', key: 'OPS-1', fields: { summary: 'Fix' } }] }));

    await expect(options('getIssue', 'issueKey')).resolves.toEqual([
      { label: '[OPS-1] Fix', value: 'OPS-1' },
    ]);
    expect(sent(calls[0])).toEqual({
      method: 'POST',
      url: `${api}/search/jql`,
      body: { jql: 'ORDER BY updated DESC', fields: ['summary'], maxResults: 100 },
    });
  });

  it('lists Atlassian users only', async () => {
    stubJira(() =>
      json([
        { accountId: 'a', accountType: 'atlassian', displayName: 'Dana' },
        { accountId: 'b', accountType: 'app', displayName: 'Bot' },
      ]),
    );

    await expect(options('assignIssue', 'assignee')).resolves.toEqual([
      { label: 'Dana', value: 'a' },
    ]);
    expect(calls[0]?.url).toBe(`${api}/users/search?maxResults=1000`);
  });

  it('lists priorities', async () => {
    stubJira(() => json({ values: [{ id: '3', name: 'Medium' }], isLast: true }));

    await expect(options('createIssue', 'priority')).resolves.toEqual([
      { label: 'Medium', value: '3' },
    ]);
    expect(calls[0]?.url).toBe(`${api}/priority/search?startAt=0&maxResults=100`);
  });

  it("lists an issue's transitions", async () => {
    stubJira(() => json({ transitions: [{ id: '31', name: 'Done' }] }));

    await expect(
      options('transitionIssue', 'transitionId', { issueKey: 'OPS-1' }),
    ).resolves.toEqual([{ label: 'Done', value: '31' }]);
    expect(calls[0]?.url).toBe(`${api}/issue/OPS-1/transitions`);
  });

  it('lists link types', async () => {
    stubJira(() => json({ issueLinkTypes: [{ id: '1000', name: 'Blocks', outward: 'blocks' }] }));

    await expect(options('linkIssues', 'linkTypeId')).resolves.toEqual([
      { label: 'Blocks (blocks)', value: '1000' },
    ]);
    expect(calls[0]?.url).toBe(`${api}/issueLinkType`);
  });

  it("lists an issue's comments by their text", async () => {
    stubJira(() => json({ comments: [{ id: '10', renderedBody: '<p>Looks <b>good</b></p>' }] }));

    await expect(options('deleteComment', 'commentId', { issueKey: 'OPS-1' })).resolves.toEqual([
      { label: 'Looks good', value: '10' },
    ]);
    expect(calls[0]?.url).toBe(
      `${api}/issue/OPS-1/comment?orderBy=-created&maxResults=100&expand=renderedBody`,
    );
  });
});
