import { z } from 'zod';

import { signal } from '../client.js';
import { dataRoot, objectName, recordId } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { queryPage, sobject, soqlString } from '../records.js';
import { isoOf, keyset, pollLimit, pollObject, rowsAfter, schedule, startKeyset } from './poll.js';

const conditions = z.string().trim().min(1).optional().meta({
  label: 'Conditions',
  description: "A SOQL WHERE condition records must also match, such as Industry = 'Technology'.",
});

const firstPoll = 'The first poll emits nothing.';

export const newRecord = definePollingTrigger({
  slug: 'newRecord',
  description: `Emit each new record of an object, oldest first, with all its fields. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({ object: objectName, conditions }),
  output: sobject,
  run({ client, input, cursor, req }) {
    return pollObject(client, {
      cursor,
      object: input.object,
      timeField: 'CreatedDate',
      where: input.conditions,
      signal: signal(req),
    });
  },
});

export const newOrUpdatedRecord = definePollingTrigger({
  slug: 'newOrUpdatedRecord',
  description: `Emit each new or changed record of an object, oldest change first, with all its fields. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({ object: objectName, conditions }),
  output: sobject,
  run({ client, input, cursor, req }) {
    return pollObject(client, {
      cursor,
      object: input.object,
      timeField: 'SystemModstamp',
      where: input.conditions,
      signal: signal(req),
    });
  },
});

export const newContact = definePollingTrigger({
  slug: 'newContact',
  description: `Emit each new Contact, oldest first, with all its fields. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({}),
  output: sobject,
  run({ client, cursor, req }) {
    return pollObject(client, {
      cursor,
      object: 'Contact',
      timeField: 'CreatedDate',
      signal: signal(req),
    });
  },
});

export const newLead = definePollingTrigger({
  slug: 'newLead',
  description: `Emit each new Lead, oldest first, with all its fields. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({}),
  output: sobject,
  run({ client, cursor, req }) {
    return pollObject(client, {
      cursor,
      object: 'Lead',
      timeField: 'CreatedDate',
      signal: signal(req),
    });
  },
});

export const newFieldHistoryEvent = definePollingTrigger({
  slug: 'newFieldHistoryEvent',
  description: `Emit each change to a history-tracked field of an object: the field, old value and new value. Needs field history tracking on in Salesforce. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({ object: objectName }),
  output: sobject,
  run({ client, input, cursor, req }) {
    return pollObject(client, {
      cursor,
      object: input.object.endsWith('__c')
        ? `${input.object.slice(0, -'__c'.length)}__History`
        : `${input.object}History`,
      timeField: 'CreatedDate',
      signal: signal(req),
    });
  },
});

export const newOrUpdatedFile = definePollingTrigger({
  slug: 'newOrUpdatedFile',
  description: `Emit each new or changed Salesforce File (ContentDocument). Classic Attachments and Notes don't count. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({}),
  output: sobject,
  run({ client, cursor, req }) {
    return pollObject(client, {
      cursor,
      object: 'ContentDocument',
      timeField: 'SystemModstamp',
      signal: signal(req),
    });
  },
});

const pairCursor = z.object({ first: keyset, second: keyset });

function sameId(value: unknown, id: string) {
  return typeof value === 'string' && value.slice(0, 15) === id.slice(0, 15);
}

function byTime(field: (row: Record<string, unknown>) => unknown) {
  return (first: Record<string, unknown>, second: Record<string, unknown>) =>
    (isoOf(field(first)) ?? '').localeCompare(isoOf(field(second)) ?? '');
}

export const newCaseAttachment = definePollingTrigger({
  slug: 'newCaseAttachment',
  description: `Emit each classic Attachment or File added to a Case, with attachmentType Classic or File. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({}),
  output: sobject,
  async run({ client, cursor, req }) {
    const previous = pairCursor.safeParse(cursor);

    if (!previous.success) {
      return { events: [], cursor: { first: startKeyset(), second: startKeyset() } };
    }

    const [classic, files] = await Promise.all([
      rowsAfter(client, {
        cursor: previous.data.first,
        object: 'Attachment',
        timeField: 'SystemModstamp',
        where: "Parent.Type = 'Case'",
        signal: signal(req),
      }),
      rowsAfter(client, {
        cursor: previous.data.second,
        object: 'ContentDocumentLink',
        timeField: 'SystemModstamp',
        where: 'LinkedEntityId IN (SELECT Id FROM Case)',
        signal: signal(req),
      }),
    ]);

    return {
      events: [
        ...classic.rows.map((row) => ({ ...row, attachmentType: 'Classic' })),
        ...files.rows.map((row) => ({ ...row, attachmentType: 'File' })),
      ].sort(byTime((row) => row.SystemModstamp)),
      cursor: { first: classic.cursor, second: files.cursor },
    };
  },
});

export const newCaseInQueue = definePollingTrigger({
  slug: 'newCaseInQueue',
  description: `Emit each Case that lands in a queue, whether created there or reassigned to it later, with all its fields. ${firstPoll}`,
  type: 'polling',
  schedule,
  input: z.object({ queueId: recordId('Case queue') }),
  output: sobject,
  async run({ client, input, cursor, req }) {
    const previous = pairCursor.safeParse(cursor);

    if (!previous.success) {
      return { events: [], cursor: { first: startKeyset(), second: startKeyset() } };
    }

    const queue = soqlString(input.queueId);
    const [moved, created] = await Promise.all([
      rowsAfter(client, {
        cursor: previous.data.first,
        object: 'CaseHistory',
        timeField: 'CreatedDate',
        select: 'Id, CaseId, CreatedDate, NewValue',
        where: "Field = 'Owner'",
        signal: signal(req),
      }),
      rowsAfter(client, {
        cursor: previous.data.second,
        object: 'Case',
        timeField: 'CreatedDate',
        select: 'Id, CreatedDate',
        where: `OwnerId = ${queue}`,
        signal: signal(req),
      }),
    ]);

    const landed = new Map<string, unknown>();

    for (const row of created.rows) landed.set(String(row.Id), row.CreatedDate);

    for (const row of moved.rows) {
      if (sameId(row.NewValue, input.queueId)) landed.set(String(row.CaseId), row.CreatedDate);
    }

    const next = { first: moved.cursor, second: created.cursor };

    if (!landed.size) return { events: [], cursor: next };

    const ids = [...landed.keys()];
    const cases = [];

    for (let start = 0; start < ids.length; start += pollLimit) {
      const chunk = ids
        .slice(start, start + pollLimit)
        .map(soqlString)
        .join(', ');

      const page = await client.request(queryPage, {
        path: `${dataRoot}/query`,
        query: { q: `SELECT FIELDS(ALL) FROM Case WHERE Id IN (${chunk}) LIMIT ${pollLimit}` },
        signal: signal(req),
      });

      cases.push(...page.records);
    }

    return { events: cases.sort(byTime((row) => landed.get(String(row.Id)))), cursor: next };
  },
});
