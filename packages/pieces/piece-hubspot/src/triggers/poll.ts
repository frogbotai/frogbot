import { z } from 'zod';

import type { HubSpotClient } from '../client.js';
import { crmRecord } from '../records.js';

/** How far back each poll looks past the previous one, for HubSpot's search index lag. */
export const lookback = 5 * 60 * 1000;

export const schedule = '*/5 * * * *';

const searchLimit = 200;
const searchCap = 10_000;

/**
 * The previous poll's time, when the trigger started, and the `id:epoch` keys of events already
 * emitted inside the lookback, so an item seen again isn't emitted twice.
 */
export type SinceCursor = { since: number; start: number; seen: string[] };

const sinceCursor = z.object({ since: z.number(), start: z.number(), seen: z.array(z.string()) });

export type PollItem<T> = { id: string; epoch: number; event: T };

export type CrmRecord = z.output<typeof crmRecord>;

export type Filter = { propertyName: string; operator: string; value?: string };

/** The parsed cursor, or `undefined` on a trigger's first poll. */
export function readCursor(cursor: unknown): SinceCursor | undefined {
  const parsed = sinceCursor.safeParse(cursor);

  return parsed.success ? parsed.data : undefined;
}

/** A first poll's result: nothing, and a cursor at now. */
export function baseline<T>(now: number): { events: T[]; cursor: SinceCursor } {
  return { events: [], cursor: { since: now, start: now, seen: [] } };
}

/** The earliest time a poll still looks at. */
export function floorOf(cursor: SinceCursor) {
  return Math.max(cursor.since - lookback, cursor.start);
}

/** Items newer than the floor and not emitted yet, oldest first, and the next cursor. */
export function emit<T>(previous: SinceCursor, items: PollItem<T>[], reached: number) {
  const floor = floorOf(previous);
  const emitted = new Set(previous.seen);
  const fresh = items
    .filter((item) => Number.isFinite(item.epoch) && item.epoch > floor)
    .map((item) => ({ ...item, key: `${item.id}:${item.epoch}` }))
    .filter((item) => !emitted.has(item.key))
    .sort((first, second) => first.epoch - second.epoch);

  const keep = reached - lookback;

  return {
    events: fresh.map((item) => item.event),
    cursor: {
      since: reached,
      start: previous.start,
      seen: [...previous.seen, ...fresh.map((item) => item.key)].filter(
        (key) => Number(key.slice(key.lastIndexOf(':') + 1)) > keep,
      ),
    },
  };
}

export function epochOf(record: CrmRecord, property: string) {
  return Date.parse(record.properties[property] ?? '');
}

const searchPage = z.object({
  results: z.array(crmRecord),
  paging: z.object({ next: z.object({ after: z.string() }).optional() }).optional(),
});

/**
 * Records whose `timeProperty` is past `floor`, oldest first, through search. Search stops at
 * 10,000 results, so a bigger burst comes back `truncated` and the next poll continues it.
 */
export async function searchSince(
  client: HubSpotClient,
  args: {
    objectType: string;
    timeProperty: string;
    floor: number;
    properties: string[];
    filters?: Filter[];
    signal?: AbortSignal;
  },
) {
  const records: CrmRecord[] = [];
  let after: string | undefined;

  for (;;) {
    const page = await client.request(searchPage, {
      method: 'POST',
      path: `/crm/v3/objects/${args.objectType}/search`,
      body: {
        limit: searchLimit,
        properties: [...new Set([...args.properties, args.timeProperty])],
        sorts: [{ propertyName: args.timeProperty, direction: 'ASCENDING' }],
        filterGroups: [
          {
            filters: [
              ...(args.filters ?? []),
              { propertyName: args.timeProperty, operator: 'GT', value: String(args.floor) },
            ],
          },
        ],
        ...(after ? { after } : {}),
      },
      signal: args.signal,
    });

    records.push(...page.results);
    after = page.paging?.next?.after;

    if (!after) return { records, truncated: false };
    if (Number(after) + searchLimit > searchCap) return { records, truncated: true };
  }
}

/**
 * Polls one object's search by a time property. `items` turns the matching records into
 * events; by default each record is one event at its time property.
 */
export async function pollSearch<T = CrmRecord>(
  client: HubSpotClient,
  args: {
    cursor: unknown;
    objectType: string;
    timeProperty: string;
    properties: string[];
    filters?: Filter[];
    items?: (records: CrmRecord[], floor: number) => Promise<PollItem<T>[]>;
    signal?: AbortSignal;
  },
): Promise<{ events: T[]; cursor: SinceCursor }> {
  const now = Date.now();
  const previous = readCursor(args.cursor);

  if (!previous) return baseline(now);

  const floor = floorOf(previous);
  const { records, truncated } = await searchSince(client, { ...args, floor });
  const items = args.items
    ? await args.items(records, floor)
    : records.map((record) => ({
        id: record.id,
        epoch: epochOf(record, args.timeProperty),
        event: record as T,
      }));

  const reached = truncated
    ? Math.max(
        previous.since,
        ...records.map((record) => epochOf(record, args.timeProperty)).filter(Number.isFinite),
      )
    : now;

  return emit(previous, items, reached);
}

/** Polls a source that can't search: `read` returns the items between the floor and now. */
export async function pollWindow<T>(
  cursor: unknown,
  read: (floor: number, now: number) => Promise<PollItem<T>[]>,
): Promise<{ events: T[]; cursor: SinceCursor }> {
  const now = Date.now();
  const previous = readCursor(cursor);

  if (!previous) return baseline(now);

  return emit(previous, await read(floorOf(previous), now), now);
}
