import { z } from 'zod';

import type { JiraClient } from '../client.js';
import { changeHistory, issue } from '../records.js';

/** How far back each issue poll looks past the previous one, for Jira's search index lag. */
export const lookback = 15 * 60 * 1000;

const maxPages = 10;

export const jqlInput = {
  jql: z
    .string()
    .optional()
    .meta({ description: 'Only watch issues matching this JQL, such as project = OPS.' }),
  sanitizeJql: z
    .boolean()
    .default(true)
    .meta({ description: "Run the JQL through Jira's sanitizer first." }),
};

/**
 * The previous poll's time, and the `id:epoch` keys of events already emitted inside the
 * lookback, so an issue seen again with changed fields isn't emitted twice.
 */
export type SinceCursor = { since: number; seen: string[] };

const sinceCursor = z.object({ since: z.number(), seen: z.array(z.string()) });

export const polledIssue = issue.extend({
  changelog: z
    .object({ histories: z.array(changeHistory) })
    .passthrough()
    .optional(),
});

export type PolledIssue = z.output<typeof polledIssue>;

export type PollItem<T> = { id: string; epoch: number; event: T };

const searchPage = z.object({
  issues: z.array(polledIssue),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
});

function stripOrderBy(jql: string) {
  return jql.replace(/\s+order\s+by\s+[^"']*$/i, '').trim();
}

async function userScope(client: JiraClient, jql: string, sanitize: boolean, signal?: AbortSignal) {
  if (!sanitize) return jql;

  const result = await client.request(
    z.object({ queries: z.array(z.object({ sanitizedQuery: z.string().nullish() })) }),
    {
      method: 'POST',
      path: '/jql/sanitize',
      body: { queries: [{ query: jql }] },
      signal,
    },
  );

  return result.queries[0]?.sanitizedQuery ?? jql;
}

/**
 * Issues touched since the cursor, through a relative-minute JQL window reaching `lookback`
 * past it, turned into events newer than that window and not already emitted. With no cursor it
 * returns none and a cursor at now.
 */
export async function pollIssues<T>(
  client: JiraClient,
  args: {
    cursor: unknown;
    input: { jql?: string; sanitizeJql: boolean };
    timeField: 'created' | 'updated';
    scope?: (window: string) => string;
    fields?: string[];
    expand?: string[];
    items: (issue: PolledIssue) => PollItem<T>[];
    signal?: AbortSignal;
  },
): Promise<{ events: T[]; cursor: SinceCursor }> {
  const now = Date.now();
  const parsed = sinceCursor.safeParse(args.cursor);

  if (!parsed.success) return { events: [], cursor: { since: now, seen: [] } };

  const { since, seen } = parsed.data;
  const floor = since - lookback;
  const window = `-${Math.max(Math.ceil((now - floor) / 60_000), 1)}m`;
  const jql = args.input.jql?.trim()
    ? `(${await userScope(client, stripOrderBy(args.input.jql), args.input.sanitizeJql, args.signal)})`
    : undefined;

  const conditions = [jql, args.scope?.(window), `${args.timeField} >= ${window}`].filter(Boolean);
  const issues: PolledIssue[] = [];
  let nextPageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.request(searchPage, {
      method: 'POST',
      path: '/search/jql',
      body: {
        jql: `${conditions.join(' AND ')} ORDER BY ${args.timeField} ASC`,
        maxResults: 100,
        fields: args.fields ?? ['*navigable'],
        ...(args.expand ? { expand: args.expand.join(',') } : {}),
        ...(nextPageToken ? { nextPageToken } : {}),
      },
      signal: args.signal,
    });

    issues.push(...result.issues);
    nextPageToken = result.isLast ? undefined : (result.nextPageToken ?? undefined);
    if (!nextPageToken) break;
    truncated = page === maxPages - 1;
  }

  const emitted = new Set(seen);
  const fresh = issues
    .flatMap(args.items)
    .filter((item) => Number.isFinite(item.epoch) && item.epoch > floor)
    .map((item) => ({ ...item, key: `${item.id}:${item.epoch}` }))
    .filter((item) => !emitted.has(item.key))
    .sort((first, second) => first.epoch - second.epoch);

  const reached = truncated
    ? Math.max(
        since,
        ...issues
          .map((entry) => Date.parse(String(entry.fields?.[args.timeField] ?? '')))
          .filter(Number.isFinite),
      )
    : now;

  const keep = reached - lookback;

  return {
    events: fresh.map((item) => item.event),
    cursor: {
      since: reached,
      seen: [...seen, ...fresh.map((item) => item.key)].filter(
        (key) => Number(key.slice(key.lastIndexOf(':') + 1)) > keep,
      ),
    },
  };
}

/** The highest numeric id seen. */
export type MaxIdCursor = { maxId: number };

const maxIdCursor = z.object({ maxId: z.number() });

/**
 * Records whose numeric id is above the cursor's, oldest first. With no cursor it returns none
 * and a cursor at the highest id there is now.
 */
export function newById<T extends { id: string }>(cursor: unknown, records: T[]) {
  const numbered = records
    .map((record) => ({ record, id: Number(record.id) }))
    .filter(({ id }) => Number.isFinite(id))
    .sort((first, second) => first.id - second.id);

  const highest = numbered.reduce((max, { id }) => Math.max(max, id), 0);
  const parsed = maxIdCursor.safeParse(cursor);

  if (!parsed.success) return { events: [], cursor: { maxId: highest } };

  return {
    events: numbered.filter(({ id }) => id > parsed.data.maxId).map(({ record }) => record),
    cursor: { maxId: Math.max(parsed.data.maxId, highest) },
  };
}
