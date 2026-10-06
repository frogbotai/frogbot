import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  busyIntervals,
  readSessions,
  statsRows,
  summarize,
  ticketKey,
  unionMs,
} from '../../../scripts/lib/stats.mjs';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 5, 4, 0);
const main = '/code/frogbot/frogbot';

type Message = [type: string, minute: number, cost?: number];

const session = (
  id: string,
  parentID: string | null,
  title: string,
  messages: Message[],
  { agent = 'general', directory = `${main}-ticket211` } = {},
) => ({ id, parentID, title, agent, directory, messages });

// One coordinator runs 211A (two stages, a fix and a lint run), 211B, an untagged review and
// one session for a ticket outside the batch. Another project has a session tagged 211A.
const sessions = [
  session(
    'ses_coord',
    null,
    'Batch 27',
    [
      ['user', -30],
      ['assistant', -29, 1],
      ['idle', -28],
      ['user', 0],
      ['assistant', 1, 0.5],
      ['idle', 2],
      ['synthetic', 21],
      ['assistant', 22, 0.25],
      ['idle', 23],
      ['synthetic', 100],
      ['assistant', 101, 0.25],
      ['idle', 102],
    ],
    { directory: main },
  ),
  session('ses_a1', 'ses_coord', '211A stage 1: probes', [
    ['user', 2],
    ['assistant', 3, 2],
    ['assistant', 12, 1],
    ['idle', 12],
  ]),
  session(
    'ses_a1_lint',
    'ses_a1',
    'lint: pnpm check',
    [
      ['user', 5],
      ['assistant', 6, 0.01],
      ['idle', 6],
    ],
    { agent: 'lint' },
  ),
  session('ses_a2', 'ses_coord', '211a land fix: jobsRun.spec', [
    ['user', 10],
    ['assistant', 20, 3],
    ['idle', 20],
  ]),
  session('ses_b1', 'ses_coord', '211B: cells', [
    ['user', 30],
    ['assistant', 40, 4],
  ]),
  session('ses_review', 'ses_coord', 'Review 211 research', [
    ['user', 25],
    ['assistant', 28, 0.5],
    ['idle', 28],
  ]),
  session('ses_old', 'ses_coord', 'Old planning', [
    ['user', -20],
    ['assistant', -19, 9],
    ['idle', -19],
  ]),
  session('ses_other_batch', 'ses_coord', '248 step4: fixes', [
    ['user', 32],
    ['assistant', 35, 7],
    ['idle', 35],
  ]),
  session(
    'ses_elsewhere',
    null,
    '211A unrelated project',
    [
      ['user', 0],
      ['assistant', 1, 100],
      ['idle', 1],
    ],
    { directory: '/code/other' },
  ),
];

let dir: string;
let file: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'frogbot-stats-'));
  file = path.join(dir, 'opencode.db');

  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, agent TEXT,
      directory TEXT NOT NULL, cost REAL, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
      seq INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
      data TEXT NOT NULL);
  `);

  const insertSession = db.prepare('INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?, 0, ?, ?)');
  const insertMessage = db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)');

  for (const { id, parentID, title, agent, directory, messages } of sessions) {
    // time_updated is stale for foreground children; stats must not read it.
    insertSession.run(id, parentID, title, agent, directory, T0, T0);

    messages.forEach(([type, minute, cost], seq) => {
      const time = T0 + minute * MIN;
      const data =
        cost === undefined
          ? { time: { created: time } }
          : {
              time: { created: time },
              cost,
              tokens: { input: 10, output: 20, cache: { read: 1000, write: 100 } },
            };

      insertMessage.run(`${id}_${seq}`, id, type, seq, time, T0, JSON.stringify(data));
    });
  }

  db.close();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ticketKey', () => {
  it.each([
    ['211A stage 4: autonumber', '211a'],
    ['250 lint: pnpm check', '250'],
    ['212b: bulk', '212b'],
    ['250', '250'],
    ['Review 214 research', null],
    ['211-A stage', null],
    ['2110xy stage', null],
  ])('%s → %s', (title, key) => {
    expect(ticketKey(title)).toBe(key);
  });
});

describe('busy time', () => {
  it('runs from the first message after idle to the next idle', () => {
    const messages = [
      { type: 'user', time: 0 },
      { type: 'assistant', time: 5 },
      { type: 'idle', time: 6 },
      { type: 'synthetic', time: 20 },
      { type: 'assistant', time: 25 },
    ];

    expect(busyIntervals(messages)).toEqual([
      [0, 6],
      [20, 25],
    ]);
  });

  it('counts overlapping intervals once', () => {
    expect(
      unionMs([
        [0, 10],
        [5, 12],
        [20, 25],
      ]),
    ).toBe(17);
  });
});

describe('readSessions and summarize', () => {
  const run = () => {
    const tickets = new Set([211]);
    const { sessions: read, messages } = readSessions(file, { main, tickets });
    const ledger = [
      { ticket: '211a', verifier: 'land', level: 'failed' },
      { ticket: '211a', verifier: 'land', level: 'int' },
      { ticket: '211b', verifier: 'land', level: 'flaky' },
      { ticket: '211b', verifier: 'land', level: 'int' },
      { ticket: '211b', verifier: 'tester', level: 'unit' },
    ];

    return { read, summary: summarize({ sessions: read, messages, ledger, tickets }) };
  };

  it('reads the coordinator tree of tagged sessions in this project', () => {
    expect(
      run()
        .read.map(({ id }) => id)
        .sort(),
    ).toEqual([
      'ses_a1',
      'ses_a1_lint',
      'ses_a2',
      'ses_b1',
      'ses_coord',
      'ses_old',
      'ses_other_batch',
      'ses_review',
    ]);
  });

  it('adds up each ticket, other and the coordinator within the batch window', () => {
    const rows = Object.fromEntries(run().summary.map((row) => [row.name, row]));

    expect(rows['211a']).toMatchObject({
      sessions: 2,
      fixes: 1,
      lands: 2,
      cost: 6.01,
      turns: 4,
      input: 40,
      cacheRead: 4000,
      wall: 18 * MIN,
      active: 18 * MIN,
    });
    expect(rows['211b']).toMatchObject({
      sessions: 1,
      fixes: 0,
      lands: 1,
      cost: 4,
      active: 10 * MIN,
    });
    expect(rows.other).toMatchObject({ sessions: 2, cost: 7.5, active: 6 * MIN });
    expect(rows.coordinator).toMatchObject({ cost: 0.25, turns: 1, active: 2 * MIN });
    expect(rows.total).toMatchObject({ lands: 3, active: 33 * MIN });
  });

  it('prints one row per ticket, then other, coordinator and total', () => {
    const rows = statsRows(run().summary);

    expect(rows.map(({ ticket }) => ticket)).toEqual([
      '211a',
      '211b',
      'other',
      'coordinator',
      'total',
    ]);
    expect(rows[0]).toEqual({
      ticket: '211a',
      sessions: '2',
      fixes: '1',
      lands: '2',
      wall: '18m',
      active: '18m',
      cost: '$6.01',
      input: '40',
      output: '80',
      'cache read': '4k',
      'cache write': '400',
      turns: '4',
    });
  });
});
