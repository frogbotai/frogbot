import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createJira, JiraError } from '../../../packages/pieces/piece-jira/src/index.js';
import { api, basic, calls, json, oauth, req, site, stubJira, token } from './fixtures.js';

const resources = 'https://api.atlassian.com/oauth/token/accessible-resources';

const sites = [
  { id: 'cloud-a', url: 'https://acme.atlassian.net', name: 'acme' },
  { id: 'cloud-b', url: 'https://beta.atlassian.net', name: 'beta' },
];

function oauthRoute(available = sites.slice(0, 1)) {
  return (call: { url: string }) =>
    call.url === resources ? json(available) : json({ id: '1', key: 'OPS-1' });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Jira siteUrl option', () => {
  it.each([
    ['http:', 'http://acme.atlassian.net'],
    ['another host', 'https://acme.example.com'],
    ['a look-alike host', 'https://acme.atlassian.net.evil.test'],
    ['a nested host', 'https://a.b.atlassian.net'],
    ['a path', 'https://acme.atlassian.net/jira'],
    ['a query', 'https://acme.atlassian.net/?a=1'],
    ['credentials', 'https://user@acme.atlassian.net'],
    ['a port', 'https://acme.atlassian.net:8443'],
    ['not a URL', 'acme'],
  ])('refuses %s', (_name, siteUrl) => {
    expect(() => createJira({ siteUrl })).toThrow(/https:\/\/<name>\.atlassian\.net/);
  });

  it('takes the site origin, with or without a trailing slash', async () => {
    stubJira(() => json({ id: '1', key: 'OPS-1' }));

    const jira = createJira({ siteUrl: 'https://acme.atlassian.net/' });

    await jira.getIssue({ input: { issueKey: 'OPS-1' }, req: req() });

    expect(calls[0]?.url).toBe(`${api}/issue/OPS-1`);
    expect(calls[0]?.headers.get('authorization')).toBe(basic);
  });

  it('needs siteUrl for API tokens', async () => {
    stubJira(() => json({}));

    await expect(createJira({}).client({ req: req(token) })).rejects.toThrow(
      'Jira needs the `siteUrl` option for API tokens.',
    );
    expect(calls).toEqual([]);
  });
});

describe('Jira OAuth client', () => {
  it("uses an account's only site with a Bearer token", async () => {
    stubJira(oauthRoute());

    const jira = createJira({});

    await jira.getIssue({ input: { issueKey: 'OPS-1' }, req: req(oauth) });

    expect(calls.map((call) => call.url)).toEqual([
      resources,
      'https://api.atlassian.com/ex/jira/cloud-a/rest/api/3/issue/OPS-1',
    ]);
    expect(
      calls.every((call) => call.headers.get('authorization') === 'Bearer atlassian-token'),
    ).toBe(true);
  });

  it('picks the site matching siteUrl among several', async () => {
    stubJira(oauthRoute(sites));

    const client = await createJira({ siteUrl: 'https://beta.atlassian.net' }).client({
      req: req(oauth),
    });

    expect(client.baseUrl).toBe('https://api.atlassian.com/ex/jira/cloud-b');
  });

  it('throws listing the sites when there are several and no siteUrl', async () => {
    stubJira(oauthRoute(sites));

    await expect(createJira({}).client({ req: req(oauth) })).rejects.toThrow(
      'This Atlassian account reaches several Jira sites; set the siteUrl option to one of: https://acme.atlassian.net, https://beta.atlassian.net.',
    );
  });

  it('throws listing the sites when none matches siteUrl', async () => {
    stubJira(oauthRoute(sites));

    await expect(
      createJira({ siteUrl: 'https://gamma.atlassian.net' }).client({ req: req(oauth) }),
    ).rejects.toThrow(
      'This Atlassian account cannot reach https://gamma.atlassian.net. Its sites: https://acme.atlassian.net, https://beta.atlassian.net.',
    );
  });

  it('looks the site up once per credential across actions', async () => {
    stubJira(oauthRoute());

    const jira = createJira({});
    const request = req(oauth);

    await jira.getIssue({ input: { issueKey: 'OPS-1' }, req: request });
    await jira.getIssue({ input: { issueKey: 'OPS-2' }, req: request });

    expect(calls.filter((call) => call.url === resources)).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });
});

describe('Jira errors and rate limits', () => {
  const jira = createJira({ siteUrl: site });
  const item = z.object({ id: z.string() });

  it("throws Jira's errorMessages and field errors with the status", async () => {
    stubJira(() =>
      json({ errorMessages: ['Issue does not exist.'], errors: { summary: 'Required.' } }, 404),
    );

    const error = await jira
      .getIssue({ input: { issueKey: 'OPS-9' }, req: req() })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(JiraError);
    expect(error).toMatchObject({
      status: 404,
      message: 'Jira request failed (404): Issue does not exist.; summary: Required.',
    });
  });

  it('waits Retry-After seconds on a 429, then succeeds', async () => {
    vi.useFakeTimers();

    let attempt = 0;

    stubJira(() => (++attempt === 1 ? json({}, 429, { 'retry-after': '2' }) : json({ id: '1' })));

    const client = await jira.client({ req: req() });
    const pending = client.request(item, { path: '/issue/OPS-1' });

    await vi.advanceTimersByTimeAsync(1999);

    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ id: '1' });
    expect(calls).toHaveLength(2);
  });

  it("throws the fourth 429 with Jira's message and status", async () => {
    stubJira(() => json({ errorMessages: ['Rate limit exceeded.'] }, 429, { 'retry-after': '0' }));

    const client = await jira.client({ req: req() });
    const error = await client
      .request(item, { path: '/myself' })
      .catch((caught: unknown) => caught);

    expect(calls).toHaveLength(4);
    expect(error).toMatchObject({
      status: 429,
      message: 'Jira request failed (429): Rate limit exceeded.',
    });
  });

  it('stops waiting when the request aborts', async () => {
    stubJira(() => json({}, 429, { 'retry-after': '60' }));

    const controller = new AbortController();
    const client = await jira.client({ req: req() });
    const pending = client.request(item, { path: '/myself', signal: controller.signal });

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    controller.abort(new Error('Stopped.'));

    await expect(pending).rejects.toThrow('Stopped.');
    expect(calls).toHaveLength(1);
  });

  it('refuses redirects', async () => {
    stubJira(() => json({ id: '1' }));

    await (await jira.client({ req: req() })).request(item, { path: '/myself' });

    expect(calls[0]).toBeDefined();
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });
});
