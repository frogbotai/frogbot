import { createRequire } from 'node:module';
import path from 'node:path';

export const KEY = /^(\d+)([a-z])?(?=[\s:]|$)/i;

export const OTHER = 'other';

export const COORDINATOR = 'coordinator';

const LINT_AGENT = 'lint';

const FIX = /\bfix\b/i;

export function ticketKey(title) {
  const match = KEY.exec(title ?? '');

  return match ? `${Number(match[1])}${(match[2] ?? '').toLowerCase()}` : null;
}

export function keyTicket(key) {
  return Number(/^\d+/.exec(key)[0]);
}

export function busyIntervals(messages) {
  const intervals = [];
  let start = null;
  let last = null;

  for (const { type, time } of messages) {
    if (type === 'idle') {
      if (start !== null) intervals.push([start, time]);
      start = null;
    } else if (start === null) start = time;

    last = time;
  }

  if (start !== null) intervals.push([start, last]);

  return intervals;
}

export function clip(intervals, [from, to]) {
  return intervals
    .map(([start, end]) => [Math.max(start, from), Math.min(end, to)])
    .filter(([start, end]) => end > start);
}

export function unionMs(intervals) {
  const sorted = intervals.toSorted((a, b) => a[0] - b[0]);
  let total = 0;
  let current = null;

  for (const [start, end] of sorted) {
    if (current && start <= current[1]) current[1] = Math.max(current[1], end);
    else {
      if (current) total += current[1] - current[0];
      current = [start, end];
    }
  }

  return total + (current ? current[1] - current[0] : 0);
}

function emptyRow(name) {
  return {
    name,
    sessions: 0,
    fixes: 0,
    lands: 0,
    intervals: [],
    cost: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    turns: 0,
  };
}

function addMessages(row, messages) {
  for (const message of messages) {
    if (message.type === 'assistant') row.turns++;

    row.cost += message.cost ?? 0;
    row.input += message.input ?? 0;
    row.output += message.output ?? 0;
    row.cacheRead += message.cacheRead ?? 0;
    row.cacheWrite += message.cacheWrite ?? 0;
  }
}

function within(messages, [from, to]) {
  return messages.filter(({ time }) => time >= from && time <= to);
}

export function batchKeys(sessions, tickets) {
  const seen = new Set(
    sessions
      .map(({ title }) => ticketKey(title))
      .filter((key) => key !== null && tickets.has(keyTicket(key))),
  );

  for (const ticket of tickets) {
    if (![...seen].some((key) => keyTicket(key) === ticket)) seen.add(String(ticket));
  }

  return seen;
}

export function attribute(sessions, keys) {
  const byID = new Map(sessions.map((session) => [session.id, session]));
  const owners = new Map();

  const ownerOf = (session) => {
    if (owners.has(session.id)) return owners.get(session.id);

    const key = ticketKey(session.title);
    const parent = session.parentID ? byID.get(session.parentID) : undefined;
    let owner;

    if (key && keys.has(key)) owner = key;
    else if (!parent) owner = COORDINATOR;
    else {
      const inherited = ownerOf(parent);

      owner = inherited === COORDINATOR ? OTHER : inherited;
    }

    owners.set(session.id, owner);

    return owner;
  };

  for (const session of sessions) ownerOf(session);

  return owners;
}

export function summarize({ sessions, messages, ledger, tickets }) {
  const keys = batchKeys(sessions, tickets);
  const owners = attribute(sessions, keys);
  const rows = new Map([...keys].map((key) => [key, emptyRow(key)]));
  const tagged = [];

  for (const session of sessions) {
    const owner = owners.get(session.id);
    const own = messages.get(session.id) ?? [];

    if (!rows.has(owner)) continue;

    const row = rows.get(owner);
    const intervals = busyIntervals(own);

    row.intervals.push(...intervals);
    tagged.push(...intervals);
    addMessages(row, own);

    if (ticketKey(session.title) === owner && session.agent !== LINT_AGENT) {
      row.sessions++;
      if (FIX.test(session.title.replace(KEY, ''))) row.fixes++;
    }
  }

  for (const row of rows.values()) {
    row.lands = ledger.filter(
      (entry) => entry.ticket === row.name && entry.verifier === 'land' && entry.level !== 'flaky',
    ).length;
  }

  const window =
    tagged.length > 0
      ? [Math.min(...tagged.map(([start]) => start)), Math.max(...tagged.map(([, end]) => end))]
      : null;

  const extra = { [OTHER]: emptyRow(OTHER), [COORDINATOR]: emptyRow(COORDINATOR) };

  if (window) {
    for (const session of sessions) {
      const row = extra[owners.get(session.id)];
      if (!row) continue;

      const own = messages.get(session.id) ?? [];
      const intervals = clip(busyIntervals(own), window);

      if (row.name === OTHER && intervals.length > 0) row.sessions++;

      row.intervals.push(...intervals);
      addMessages(row, within(own, window));
    }
  }

  const ordered = [...rows.values()].sort(
    (a, b) => keyTicket(a.name) - keyTicket(b.name) || a.name.localeCompare(b.name),
  );

  const all = [...ordered, extra[OTHER], extra[COORDINATOR]];
  const total = emptyRow('total');
  const summed = [
    'sessions',
    'fixes',
    'lands',
    'cost',
    'input',
    'output',
    'cacheRead',
    'cacheWrite',
    'turns',
  ];

  for (const row of all) {
    for (const field of summed) total[field] += row[field];

    total.intervals.push(...row.intervals);
  }

  return [...all, total].map((row) => ({
    ...row,
    wall:
      row.intervals.length > 0
        ? Math.max(...row.intervals.map(([, end]) => end)) -
          Math.min(...row.intervals.map(([start]) => start))
        : 0,
    active: unionMs(row.intervals),
  }));
}

function minutes(ms) {
  const total = Math.round(ms / 60_000);

  return total >= 60
    ? `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`
    : `${total}m`;
}

function tokens(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;

  return String(count);
}

export function statsRows(summary) {
  return summary.map((row) => ({
    ticket: row.name,
    sessions: String(row.sessions),
    fixes: String(row.fixes),
    lands: String(row.lands),
    wall: minutes(row.wall),
    active: minutes(row.active),
    cost: `$${row.cost.toFixed(2)}`,
    input: tokens(row.input),
    output: tokens(row.output),
    'cache read': tokens(row.cacheRead),
    'cache write': tokens(row.cacheWrite),
    turns: String(row.turns),
  }));
}

export function inProject(directory, main) {
  const [checkout] = path.relative(path.dirname(main), directory).split(path.sep);

  return !checkout.startsWith('..') && checkout.startsWith(path.basename(main));
}

const SESSION_COLUMNS = 'id, parent_id AS parentID, title, agent, directory';

export function readSessions(file, { main, tickets }) {
  // Loaded here so other ticket commands don't print node:sqlite's experimental warning.
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });

  try {
    const candidates = db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM session_v2 WHERE title GLOB '[0-9]*'`)
      .all()
      .filter(({ title, directory }) => {
        const key = ticketKey(title);

        return key !== null && tickets.has(keyTicket(key)) && inProject(directory, main);
      });

    const parentOf = db.prepare(`SELECT ${SESSION_COLUMNS} FROM session_v2 WHERE id = ?`);
    const roots = new Set();

    for (const session of candidates) {
      let current = session;

      while (current.parentID) {
        const parent = parentOf.get(current.parentID);
        if (!parent) break;
        current = parent;
      }

      roots.add(current.id);
    }

    if (roots.size === 0) return { sessions: [], messages: new Map() };

    const sessions = db
      .prepare(
        `WITH RECURSIVE tree(id) AS (
           SELECT value FROM json_each(?)
           UNION SELECT s.id FROM session_v2 s JOIN tree ON s.parent_id = tree.id
         )
         SELECT ${SESSION_COLUMNS} FROM session_v2 WHERE id IN (SELECT id FROM tree)`,
      )
      .all(JSON.stringify([...roots]));

    const rowsOf = db.prepare(
      `SELECT type, time_created AS time,
         CASE WHEN type IN ('assistant', 'compaction') THEN json_extract(data, '$.cost') END AS cost,
         CASE WHEN type IN ('assistant', 'compaction') THEN json_extract(data, '$.tokens.input') END AS input,
         CASE WHEN type IN ('assistant', 'compaction') THEN json_extract(data, '$.tokens.output') END AS output,
         CASE WHEN type IN ('assistant', 'compaction') THEN json_extract(data, '$.tokens.cache.read') END AS cacheRead,
         CASE WHEN type IN ('assistant', 'compaction') THEN json_extract(data, '$.tokens.cache.write') END AS cacheWrite
       FROM session_message WHERE session_id = ? ORDER BY seq`,
    );

    return { sessions, messages: new Map(sessions.map(({ id }) => [id, rowsOf.all(id)])) };
  } finally {
    db.close();
  }
}
