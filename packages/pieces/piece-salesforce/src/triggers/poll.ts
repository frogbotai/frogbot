import { z } from 'zod';

import type { SalesforceClient } from '../client.js';
import { dataRoot } from '../config.js';
import { queryPage, soqlString } from '../records.js';

export const schedule = '*/5 * * * *';

/** Rows per poll; `FIELDS(ALL)` allows at most 200. */
export const pollLimit = 200;

/** The last row a poll emitted, by its timestamp and ID; a tie on the timestamp goes by ID. */
export const keyset = z.object({
  at: z.iso.datetime(),
  id: z.string().regex(/^[A-Za-z0-9]{0,18}$/),
});

export type Keyset = z.output<typeof keyset>;

type Row = Record<string, unknown>;

/** A Salesforce timestamp, such as `2026-01-02T03:04:05.000+0000`, as ISO 8601 UTC. */
export function isoOf(value: unknown) {
  const time =
    typeof value === 'string' ? Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN;

  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

/** A first poll's cursor: now, so only later rows are emitted. */
export function startKeyset(): Keyset {
  return { at: new Date().toISOString(), id: '' };
}

/**
 * Up to 200 rows after `cursor`, oldest first, ordered by `(timeField, Id)`. Rows sharing a
 * timestamp across polls are never skipped, and a backlog drains over the next polls.
 */
export async function rowsAfter(
  client: SalesforceClient,
  args: {
    cursor: Keyset;
    object: string;
    timeField: string;
    select?: string;
    where?: string;
    signal?: AbortSignal;
  },
): Promise<{ rows: Row[]; cursor: Keyset }> {
  const { at, id } = args.cursor;
  const after = `(${args.timeField} > ${at} OR (${args.timeField} = ${at} AND Id > ${soqlString(id)}))`;
  const page = await client.request(queryPage, {
    path: `${dataRoot}/query`,
    query: {
      q: [
        `SELECT ${args.select ?? 'FIELDS(ALL)'} FROM ${args.object}`,
        `WHERE ${after}${args.where ? ` AND (${args.where})` : ''}`,
        `ORDER BY ${args.timeField} ASC, Id ASC LIMIT ${pollLimit}`,
      ].join(' '),
    },
    signal: args.signal,
  });

  const last = page.records.at(-1);
  const lastAt = last && isoOf(last[args.timeField]);

  return {
    rows: page.records,
    cursor: last && lastAt ? { at: lastAt, id: String(last.Id) } : args.cursor,
  };
}

/** Polls one object by a timestamp field, one event per row. */
export async function pollObject(
  client: SalesforceClient,
  args: {
    cursor: unknown;
    object: string;
    timeField: string;
    where?: string;
    signal?: AbortSignal;
  },
) {
  const previous = keyset.safeParse(args.cursor);

  if (!previous.success) return { events: [], cursor: startKeyset() };

  const { rows, cursor } = await rowsAfter(client, { ...args, cursor: previous.data });

  return { events: rows, cursor };
}
