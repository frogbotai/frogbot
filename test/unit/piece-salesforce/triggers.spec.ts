import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { PiecePollingTrigger } from '../../../packages/frogbot/src/pieces/types.js';
import { createSalesforce } from '../../../packages/pieces/piece-salesforce/src/index.js';
import { calls, json, query, req, stubSalesforce } from './fixtures.js';

const salesforce = createSalesforce({});
const definition = pieceFactoryDefinition(createSalesforce);

type Row = Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function trigger(slug: string) {
  return definition.triggers?.find((entry) => entry.slug === slug) as PiecePollingTrigger;
}

async function poll(slug: string, input: object, cursor: unknown) {
  const client = await salesforce.client({ req: req() });

  return (await trigger(slug).run({ input, cursor, client, options: {}, req: req() } as never)) as {
    events: Row[];
    cursor: unknown;
  };
}

const sfTime = (iso: string) => iso.replace('Z', '+0000');

function stubOrg(tables: Record<string, Row[]>) {
  stubSalesforce((call) => {
    const q = query(call).q ?? '';
    const object = /FROM (\w+)/.exec(q)?.[1] ?? '';
    const rows = tables[object] ?? [];
    const ids = /WHERE Id IN \(([^)]*)\)/.exec(q)?.[1];

    if (ids) {
      const wanted = ids.split(', ').map((id) => id.slice(1, -1));

      return json({
        totalSize: 0,
        done: true,
        records: rows.filter((row) => wanted.includes(String(row.Id))),
      });
    }

    const [, field = '', at = '', id = ''] =
      /\((\w+) > (\S+) OR \(\w+ = \S+ AND Id > '(\w*)'\)\)/.exec(q) ?? [];

    const limit = Number(/LIMIT (\d+)/.exec(q)?.[1]);
    const key = (row: Row) =>
      `${new Date(String(row[field]).replace('+0000', 'Z')).toISOString()}|${String(row.Id)}`;

    const records = rows
      .filter((row) => row[field] !== undefined && key(row) > `${at}|${id}`)
      .sort((first, second) => key(first).localeCompare(key(second)))
      .slice(0, limit);

    return json({ totalSize: records.length, done: true, records });
  });
}

const earlier = '2026-01-01T00:00:00.000Z';
const start = '2026-01-02T00:00:00.000Z';
const tie = '2026-01-02T00:05:00.000Z';

function backlog(field: string, extra: Row = {}) {
  const spread = Array.from({ length: 199 }, (_, index) => ({
    Id: `a0${String(index).padStart(16, '0')}`,
    [field]: sfTime(new Date(Date.parse(start) + (index + 1) * 1000).toISOString()),
    ...extra,
  }));

  const tied = ['b', 'c', 'd'].map((letter) => ({
    Id: `${letter}0${'0'.repeat(16)}`,
    [field]: sfTime(tie),
    ...extra,
  }));

  return [{ Id: 'z00000000000000000', [field]: sfTime(earlier), ...extra }, ...spread, ...tied];
}

const single: Array<{ slug: string; input: object; object: string; field: string }> = [
  {
    slug: 'newRecord',
    input: { object: 'Invoice__c' },
    object: 'Invoice__c',
    field: 'CreatedDate',
  },
  {
    slug: 'newOrUpdatedRecord',
    input: { object: 'Account' },
    object: 'Account',
    field: 'SystemModstamp',
  },
  { slug: 'newContact', input: {}, object: 'Contact', field: 'CreatedDate' },
  { slug: 'newLead', input: {}, object: 'Lead', field: 'CreatedDate' },
  {
    slug: 'newFieldHistoryEvent',
    input: { object: 'Account' },
    object: 'AccountHistory',
    field: 'CreatedDate',
  },
  {
    slug: 'newFieldHistoryEvent',
    input: { object: 'Invoice__c' },
    object: 'Invoice__History',
    field: 'CreatedDate',
  },
  { slug: 'newOrUpdatedFile', input: {}, object: 'ContentDocument', field: 'SystemModstamp' },
];

describe('Salesforce polling triggers', () => {
  it.each(single.map((entry) => [`${entry.slug} on ${entry.object}`, entry] as const))(
    '%s emits nothing on the first poll, then each row once across a shared timestamp',
    async (_name, entry) => {
      vi.useFakeTimers({ now: Date.parse(start), toFake: ['Date'] });
      stubOrg({ [entry.object]: backlog(entry.field) });

      const first = await poll(entry.slug, entry.input, undefined);

      expect(first.events).toEqual([]);
      expect(calls).toHaveLength(0);

      const second = await poll(entry.slug, entry.input, first.cursor);
      const third = await poll(entry.slug, entry.input, second.cursor);
      const fourth = await poll(entry.slug, entry.input, third.cursor);
      const ids = [...second.events, ...third.events].map((row) => row.Id);

      expect(second.events).toHaveLength(200);
      expect(third.events).toHaveLength(2);
      expect(new Set(ids).size).toBe(202);
      expect(ids).not.toContain('z00000000000000000');
      expect(fourth).toEqual({ events: [], cursor: third.cursor });
      expect(query(calls[0]).q).toContain(`FROM ${entry.object} `);
      expect(query(calls[0]).q).toContain(`ORDER BY ${entry.field} ASC, Id ASC LIMIT 200`);
    },
  );

  it('adds the trigger conditions to the keyset', async () => {
    stubOrg({});

    await poll(
      'newRecord',
      { object: 'Account', conditions: "Industry = 'Tech'" },
      { at: start, id: '' },
    );

    expect(query(calls[0]).q).toBe(
      `SELECT FIELDS(ALL) FROM Account WHERE (CreatedDate > ${start} OR (CreatedDate = ${start} AND Id > '')) AND (Industry = 'Tech') ORDER BY CreatedDate ASC, Id ASC LIMIT 200`,
    );
  });

  it('starts over at now when the stored cursor is not a keyset', async () => {
    stubOrg({});

    const result = await poll('newContact', {}, { at: "2026' OR Id != '", id: '' });

    expect(result.events).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('newCaseAttachment emits classic Attachments and Files once each across a shared timestamp', async () => {
    vi.useFakeTimers({ now: Date.parse(start), toFake: ['Date'] });

    stubOrg({
      Attachment: backlog('SystemModstamp'),
      ContentDocumentLink: backlog('SystemModstamp').slice(-3),
    });

    const first = await poll('newCaseAttachment', {}, undefined);

    expect(first.events).toEqual([]);

    const second = await poll('newCaseAttachment', {}, first.cursor);
    const third = await poll('newCaseAttachment', {}, second.cursor);
    const all = [...second.events, ...third.events];

    expect(all.filter((row) => row.attachmentType === 'Classic')).toHaveLength(202);
    expect(all.filter((row) => row.attachmentType === 'File')).toHaveLength(3);
    expect(new Set(all.map((row) => `${String(row.attachmentType)}:${String(row.Id)}`)).size).toBe(
      205,
    );
    expect(calls.map((call) => query(call).q).join('\n')).toContain(
      'AND (LinkedEntityId IN (SELECT Id FROM Case))',
    );
  });

  it('newCaseInQueue emits Cases created in the queue or moved into it, once each', async () => {
    vi.useFakeTimers({ now: Date.parse(start), toFake: ['Date'] });

    const queue = '00G000000000001AAA';
    const history = backlog('CreatedDate', { Field: 'Owner', NewValue: queue }).map(
      (row, index) => ({
        ...row,
        CaseId: `500${String(index).padStart(15, '0')}`,
      }),
    );

    const elsewhere = {
      Id: 'e00000000000000000',
      CreatedDate: sfTime(tie),
      CaseId: '500999999999999999',
      NewValue: '005000000000001AAA',
    };

    const created = { Id: '500888888888888888', CreatedDate: sfTime(tie), Subject: 'New' };
    const moved = history.map((row) => ({ Id: row.CaseId, Subject: 'Moved' }));

    stubOrg({ CaseHistory: [...history, elsewhere], Case: [created, ...moved] });

    const first = await poll('newCaseInQueue', { queueId: queue }, undefined);
    const second = await poll('newCaseInQueue', { queueId: queue }, first.cursor);
    const third = await poll('newCaseInQueue', { queueId: queue }, second.cursor);
    const ids = [...second.events, ...third.events].map((row) => row.Id);

    expect(first.events).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('500888888888888888');
    expect(ids).not.toContain('500999999999999999');
    expect(ids).toHaveLength(202 + 1);
    expect(query(calls.at(-1)).q).toMatch(/^SELECT FIELDS\(ALL\) FROM Case WHERE Id IN \(/);
  });
});
