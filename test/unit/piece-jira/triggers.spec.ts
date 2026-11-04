import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createJira, jiraTriggers } from '../../../packages/pieces/piece-jira/src/index.js';
import { api, body, calls, json, req, site, stubJira } from './fixtures.js';

const jira = createJira({ siteUrl: site });
const now = Date.parse('2026-11-03T12:00:00.000Z');
const minute = 60_000;
const since = now - 5 * minute;
const iso = (ms: number) => new Date(ms).toISOString();

type Slug = (typeof jiraTriggers)[number];

async function poll(slug: Slug, input: object, cursor?: unknown) {
  const trigger = jira.triggers[slug] as unknown as {
    input: { parse(value: unknown): unknown };
    run(args: object): Promise<{ events: Record<string, unknown>[]; cursor: unknown }>;
  };

  const request = req();

  return trigger.run({
    input: trigger.input.parse(input),
    cursor,
    client: await jira.client({ req: request }),
    options: {},
    req: request,
  });
}

function searches() {
  return calls.filter((call) => call.url === `${api}/search/jql`).map((call) => body(call));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Jira triggers', () => {
  it('declares the nine upstream triggers, polling every 5 minutes', () => {
    const triggers = pieceFactoryDefinition(createJira).triggers ?? [];

    expect(triggers.map((trigger) => trigger.slug)).toEqual([...jiraTriggers]);
    expect(
      triggers.map((trigger) => [trigger.type, 'schedule' in trigger && trigger.schedule]),
    ).toEqual(jiraTriggers.map(() => ['polling', '*/5 * * * *']));
  });

  it.each([
    ['issueCreated', {}],
    ['issueUpdated', {}],
    ['issueStatusChanged', {}],
    ['issueAssigned', {}],
    ['commentAdded', {}],
    ['attachmentAdded', {}],
  ] as const)('%s seeds a cursor at now, with no events and no request', async (slug, input) => {
    stubJira(() => json({ issues: [] }));

    await expect(poll(slug, input)).resolves.toEqual({
      events: [],
      cursor: { since: now, seen: [] },
    });
    expect(calls).toEqual([]);
  });

  it('issueCreated queries the window since the cursor with a 15-minute lookback', async () => {
    const fresh = { id: '1', key: 'OPS-1', fields: { created: iso(now - minute) } };
    const lagged = { id: '2', key: 'OPS-2', fields: { created: iso(since - 9 * minute) } };
    const old = { id: '3', key: 'OPS-3', fields: { created: iso(since - 16 * minute) } };

    stubJira(() => json({ issues: [old, lagged, fresh], isLast: true }));

    const result = await poll('issueCreated', {}, { since, seen: [] });

    expect(searches()).toEqual([
      {
        jql: 'created >= -20m ORDER BY created ASC',
        maxResults: 100,
        fields: ['*navigable'],
      },
    ]);
    expect(result.events).toEqual([lagged, fresh]);
    expect(result.cursor).toEqual({
      since: now,
      seen: [`2:${since - 9 * minute}`, `1:${now - minute}`],
    });
  });

  it('issueCreated skips issues it already emitted, even with changed fields', async () => {
    const created = now - 2 * minute;

    stubJira(() =>
      json({
        issues: [{ id: '1', key: 'OPS-1', fields: { created: iso(created), summary: 'Edited' } }],
      }),
    );

    const result = await poll('issueCreated', {}, { since, seen: [`1:${created}`] });

    expect(result.events).toEqual([]);
    expect(result.cursor).toEqual({ since: now, seen: [`1:${created}`] });
  });

  it('drops seen keys once they fall out of the lookback', async () => {
    stubJira(() => json({ issues: [] }));

    const result = await poll(
      'issueUpdated',
      {},
      {
        since,
        seen: [`1:${now - 16 * minute}`, `2:${now - 14 * minute}`],
      },
    );

    expect(result.cursor).toEqual({ since: now, seen: [`2:${now - 14 * minute}`] });
  });

  it('issueUpdated scopes to the sanitized JQL without its ORDER BY', async () => {
    const updated = { id: '1', key: 'OPS-1', fields: { updated: iso(now - minute) } };

    stubJira((call) =>
      call.url.endsWith('/jql/sanitize')
        ? json({ queries: [{ sanitizedQuery: 'project = "OPS"' }] })
        : json({ issues: [updated] }),
    );

    const result = await poll(
      'issueUpdated',
      { jql: 'project = OPS ORDER BY key DESC' },
      { since, seen: [] },
    );

    expect(body(calls[0])).toEqual({ queries: [{ query: 'project = OPS' }] });
    expect(searches()[0]).toMatchObject({
      jql: '(project = "OPS") AND updated >= -20m ORDER BY updated ASC',
    });
    expect(result.events).toEqual([updated]);
  });

  it('follows pages and, when it stops at 10, resumes from the newest issue it saw', async () => {
    let page = 0;

    stubJira(() => {
      page += 1;

      return json({
        issues: [
          { id: String(page), key: `OPS-${page}`, fields: { updated: iso(since + page * 1000) } },
        ],
        nextPageToken: `page-${page + 1}`,
      });
    });

    const result = await poll('issueUpdated', { sanitizeJql: false }, { since, seen: [] });

    expect(searches()).toHaveLength(10);
    expect(searches()[1]).toMatchObject({ nextPageToken: 'page-2' });
    expect(result.events).toHaveLength(10);
    expect(result.cursor).toMatchObject({ since: since + 10_000 });
  });

  it('issueStatusChanged emits each status change in the window from the changelog', async () => {
    const issue = {
      id: '1',
      key: 'OPS-1',
      fields: { summary: 'Fix' },
      changelog: {
        histories: [
          {
            id: 'h1',
            created: iso(now - minute),
            author: { accountId: 'acc-1' },
            items: [
              {
                field: 'status',
                fieldId: 'status',
                from: '1',
                fromString: 'To Do',
                to: '3',
                toString: 'Done',
              },
              { field: 'summary', fieldId: 'summary', fromString: 'a', toString: 'Fix' },
            ],
          },
          {
            id: 'h0',
            created: iso(since - 20 * minute),
            items: [{ field: 'status', fieldId: 'status', from: '0', to: '1' }],
          },
        ],
      },
    };

    stubJira(() => json({ issues: [issue] }));

    const result = await poll('issueStatusChanged', {}, { since, seen: [] });

    expect(searches()[0]).toEqual({
      jql: 'status CHANGED AFTER -20m AND updated >= -20m ORDER BY updated ASC',
      maxResults: 100,
      fields: ['*navigable'],
      expand: 'changelog',
    });
    expect(result.events).toEqual([
      {
        issue: { id: '1', key: 'OPS-1', fields: { summary: 'Fix' } },
        change: {
          from: { id: '1', name: 'To Do' },
          to: { id: '3', name: 'Done' },
          by: { accountId: 'acc-1' },
          at: iso(now - minute),
        },
      },
    ]);
    expect(result.cursor).toEqual({ since: now, seen: [`h1:${now - minute}`] });
  });

  it('issueAssigned filters to one assignee and ignores changes older than the window', async () => {
    const histories = [
      {
        id: 'h1',
        created: iso(now - minute),
        items: [{ field: 'assignee', fieldId: 'assignee', to: 'acc-1', toString: 'Dana' }],
      },
      {
        id: 'h2',
        created: iso(now - minute),
        items: [{ field: 'assignee', fieldId: 'assignee', to: 'acc-2', toString: 'Lee' }],
      },
      {
        id: 'h3',
        created: iso(since - 30 * minute),
        items: [{ field: 'assignee', fieldId: 'assignee', to: 'acc-1', toString: 'Dana' }],
      },
    ];

    stubJira(() =>
      json({ issues: [{ id: '1', key: 'OPS-1', fields: {}, changelog: { histories } }] }),
    );

    const result = await poll('issueAssigned', { assignee: 'acc-1' }, { since, seen: [] });

    expect(searches()[0]?.jql).toBe(
      'assignee CHANGED TO "acc-1" AFTER -20m AND updated >= -20m ORDER BY updated ASC',
    );
    expect(result.events).toEqual([
      {
        issue: { id: '1', key: 'OPS-1', fields: {} },
        change: {
          from: { accountId: undefined, displayName: undefined },
          to: { accountId: 'acc-1', displayName: 'Dana' },
          by: undefined,
          at: iso(now - minute),
        },
      },
    ]);
  });

  it('issueAssigned can watch assignments to the connected account', async () => {
    stubJira(() => json({ issues: [] }));

    await poll('issueAssigned', { assignedToMe: true, assignee: 'acc-1' }, { since, seen: [] });

    expect(searches()[0]?.jql).toBe(
      'assignee CHANGED TO currentUser() AFTER -20m AND updated >= -20m ORDER BY updated ASC',
    );
  });

  it('commentAdded emits each new comment with its issue', async () => {
    const comment = { id: '10', body: {}, created: iso(now - minute) };

    stubJira(() =>
      json({
        issues: [
          {
            id: '1',
            key: 'OPS-1',
            fields: {
              summary: 'Fix',
              comment: {
                comments: [{ id: '9', body: {}, created: iso(since - 20 * minute) }, comment],
              },
            },
          },
        ],
      }),
    );

    const result = await poll('commentAdded', {}, { since, seen: [] });

    expect(searches()[0]).toMatchObject({
      jql: 'updated >= -20m ORDER BY updated ASC',
      fields: ['summary', 'comment'],
    });
    expect(result.events).toEqual([{ issue: { id: '1', key: 'OPS-1', summary: 'Fix' }, comment }]);
  });

  it('attachmentAdded emits each attachment added in the changelog', async () => {
    const file = { id: '20', filename: 'log.txt', mimeType: 'text/plain', size: 8 };

    stubJira(() =>
      json({
        issues: [
          {
            id: '1',
            key: 'OPS-1',
            fields: { summary: 'Fix', attachment: [file] },
            changelog: {
              histories: [
                {
                  id: 'h1',
                  created: iso(now - minute),
                  author: { accountId: 'acc-1' },
                  items: [
                    { field: 'Attachment', fieldId: 'attachment', to: '20', toString: 'log.txt' },
                    { field: 'Attachment', fieldId: 'attachment', to: '21', toString: 'gone.txt' },
                    { field: 'Attachment', fieldId: 'attachment', from: '19', to: null },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await poll('attachmentAdded', {}, { since, seen: [] });

    expect(searches()[0]).toMatchObject({ fields: ['summary', 'attachment'], expand: 'changelog' });
    expect(result.events).toEqual([
      {
        issue: { id: '1', key: 'OPS-1', summary: 'Fix' },
        attachment: file,
        addedBy: { accountId: 'acc-1' },
        addedAt: iso(now - minute),
      },
      {
        issue: { id: '1', key: 'OPS-1', summary: 'Fix' },
        attachment: { id: '21', filename: 'gone.txt' },
        addedBy: { accountId: 'acc-1' },
        addedAt: iso(now - minute),
      },
    ]);
  });
});

describe('Jira id-watching triggers', () => {
  it.each([
    [
      'projectCreated',
      {},
      `${api}/project/search?startAt=0&maxResults=100`,
      (items: object[]) => ({ values: items, isLast: true }),
    ],
    [
      'priorityCreated',
      {},
      `${api}/priority/search?startAt=0&maxResults=100`,
      (items: object[]) => ({ values: items, isLast: true }),
    ],
    [
      'issueTypeCreated',
      { projectId: '10' },
      `${api}/issuetype/project?projectId=10`,
      (items: object[]) => items,
    ],
  ] as const)(
    '%s seeds at the highest id, then emits higher ids',
    async (slug, input, url, wrap) => {
      const record = (id: string) => ({ id, key: `K${id}`, name: `N${id}` });

      stubJira(() => json(wrap([record('9'), record('10002'), record('10000')])));

      await expect(poll(slug, input)).resolves.toEqual({ events: [], cursor: { maxId: 10002 } });
      expect(calls.map((call) => call.url)).toEqual([url]);

      stubJira(() =>
        json(wrap([record('10000'), record('10004'), record('10002'), record('10003')])),
      );

      await expect(poll(slug, input, { maxId: 10002 })).resolves.toEqual({
        events: [record('10003'), record('10004')],
        cursor: { maxId: 10004 },
      });
    },
  );

  it('keeps the cursor when the highest record is deleted', async () => {
    stubJira(() => json({ values: [{ id: '1', key: 'A', name: 'A' }], isLast: true }));

    await expect(poll('projectCreated', {}, { maxId: 5 })).resolves.toEqual({
      events: [],
      cursor: { maxId: 5 },
    });
  });
});
