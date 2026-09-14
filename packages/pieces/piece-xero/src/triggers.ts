import { createHash } from 'node:crypto';

import type { PieceAppTrigger, PiecePollingTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { XeroClient } from './client.js';
import { xeroRecord } from './client.js';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const pageSize = z.number().int().min(1).max(1000).default(200);
const pollInput = z.object({
  tenantId: z.string().min(1),
  statuses: z.array(z.string()).default([]),
  types: z.array(z.string()).default([]),
  contactId: z.string().optional(),
  reference: z.string().optional(),
  dateFrom: date,
  dateTo: date,
  pageSize,
});
const pollCursor = z.object({
  modifiedAfter: z.string().datetime().optional(),
  windowStarted: z.string().datetime().optional(),
  nextPage: z.number().int().positive().default(1),
  seenIds: z.array(z.string()).max(5000).default([]),
  values: z.record(z.string(), z.union([z.boolean(), z.number()])).default({}),
});

type PollInput = z.output<typeof pollInput>;
type PollCursor = z.output<typeof pollCursor>;

function escapeFilter(value: string) {
  return value.replaceAll('"', '\\"');
}

function where(input: PollInput, typeField = 'Type') {
  const filters: string[] = [];

  if (input.types.length === 1) filters.push(`${typeField}=="${escapeFilter(input.types[0])}"`);
  if (input.types.length > 1) {
    filters.push(
      `(${input.types.map((value) => `${typeField}=="${escapeFilter(value)}"`).join(' OR ')})`,
    );
  }

  if (input.statuses.length === 1) filters.push(`Status=="${escapeFilter(input.statuses[0])}"`);
  if (input.statuses.length > 1) {
    filters.push(
      `(${input.statuses.map((value) => `Status=="${escapeFilter(value)}"`).join(' OR ')})`,
    );
  }

  if (input.contactId) filters.push(`Contact.ContactID==guid("${input.contactId}")`);
  if (input.reference) filters.push(`Reference=="${escapeFilter(input.reference)}"`);

  if (input.dateFrom) {
    const [year, month, day] = input.dateFrom.split('-');

    filters.push(`Date>=DateTime(${year}, ${month}, ${day})`);
  }

  if (input.dateTo) {
    const [year, month, day] = input.dateTo.split('-');

    filters.push(`Date<DateTime(${year}, ${month}, ${day})`);
  }

  return filters.join(' AND ');
}

function pollingTrigger({
  slug,
  label,
  path,
  responseKey,
  idKey,
  input = pollInput,
  base,
  select,
  fixedWhere,
  include,
}: {
  slug: string;
  label: string;
  path: string;
  responseKey: string;
  idKey: string;
  input?: typeof pollInput;
  base?: 'projects';
  select?: (record: z.output<typeof xeroRecord>, cursor: PollCursor) => boolean;
  fixedWhere?: string;
  include?: (record: z.output<typeof xeroRecord>) => boolean;
}): PiecePollingTrigger<typeof pollInput, typeof xeroRecord, object, XeroClient, PollCursor> {
  return {
    slug,
    label,
    description: `${label} in Xero.`,
    type: 'polling',
    schedule: '*/5 * * * *',
    input,
    output: xeroRecord,
    async run({ input: value, cursor, client, req }) {
      const current = pollCursor.parse(cursor ?? {});
      const seen = new Set(current.seenIds);
      const records: z.output<typeof xeroRecord>[] = [];
      const filters = [fixedWhere, where(value)].filter(Boolean).join(' AND ');
      const windowStarted = current.windowStarted ?? new Date().toISOString();
      let nextPage = current.nextPage;
      let exhausted = false;

      for (let requestCount = 0; requestCount < 5; requestCount += 1) {
        const page = nextPage;
        const response = await client.request(
          {
            base,
            path,
            tenantId: value.tenantId,
            query: {
              page,
              pageSize: value.pageSize,
              order: base ? undefined : 'UpdatedDateUTC ASC',
              where: filters || undefined,
            },
            headers: current.modifiedAfter
              ? { 'If-Modified-Since': current.modifiedAfter }
              : undefined,
            signal: req.signal ?? undefined,
          },
          z.object({ [responseKey]: z.array(xeroRecord).default([]) }),
        );
        const pageRecords = response[responseKey];

        nextPage += 1;

        pageRecords.forEach((record) => {
          const identifier = record[idKey];

          if (typeof identifier !== 'string') return;
          if (include && !include(record)) return;
          const emit = select ? select(record, current) : !seen.has(identifier);

          if (!emit) return;

          seen.add(identifier);
          records.push(record);
        });

        if (pageRecords.length < value.pageSize) {
          exhausted = true;

          break;
        }
      }

      return {
        events: records,
        cursor: {
          modifiedAfter: exhausted ? windowStarted : current.modifiedAfter,
          windowStarted: exhausted ? undefined : windowStarted,
          nextPage: exhausted ? 1 : nextPage,
          seenIds: [...seen].slice(-5000),
          values: current.values,
        },
      };
    },
  };
}

const webhookEvent = z.object({
  eventCategory: z.enum(['CONTACT', 'INVOICE']),
  eventType: z.enum(['CREATE', 'UPDATE']),
  tenantId: z.string(),
  resourceId: z.string().optional(),
  resourceUrl: z.string().url(),
  eventDateUtc: z.string().optional(),
});
const webhookDelivery = z.object({ events: z.array(webhookEvent) });
const webhookInput = z.object({
  tenantId: z.string().min(1).meta({
    label: 'Organization ID',
    description:
      'The Xero tenant ID shown under Settings > General settings > Organization details.',
  }),
  fetchFullRecord: z.boolean().default(false),
});

function webhookTrigger({
  slug,
  label,
  category,
  eventTypes,
}: {
  slug: string;
  label: string;
  category: 'CONTACT' | 'INVOICE';
  eventTypes: Array<'CREATE' | 'UPDATE'>;
}): PieceAppTrigger<typeof webhookInput, typeof xeroRecord, object, XeroClient> {
  return {
    slug,
    label,
    description: `${label} from a vendor-managed Xero webhook.`,
    type: 'app',
    event: 'xero.events',
    input: webhookInput,
    output: xeroRecord,
    async run({ input, client, req }) {
      const delivery = webhookDelivery.parse(req.data);
      const events = delivery.events.filter(
        (event) =>
          event.eventCategory === category &&
          eventTypes.includes(event.eventType) &&
          event.tenantId === input.tenantId,
      );
      const output = [];

      for (const event of events) {
        let data: z.output<typeof xeroRecord> = event;

        if (input.fetchFullRecord) {
          const url = new URL(event.resourceUrl);

          if (url.origin !== 'https://api.xero.com') {
            throw new Error('Xero webhook resource URL is invalid.');
          }

          const responseKey = category === 'CONTACT' ? 'Contacts' : 'Invoices';
          const response = await client.request(
            {
              path: url.pathname.replace('/api.xro/2.0', ''),
              tenantId: event.tenantId,
              signal: req.signal ?? undefined,
            },
            z.object({ [responseKey]: z.array(xeroRecord).min(1) }),
          );
          const record = response[responseKey][0];

          if (category === 'INVOICE' && record.Type !== 'ACCREC') continue;

          data = record;
        }

        output.push({
          dedupeKey: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
          data,
        });
      }

      return output;
    },
  };
}

export const xeroTriggers = [
  webhookTrigger({
    slug: 'contactCreated',
    label: 'Contact created',
    category: 'CONTACT',
    eventTypes: ['CREATE'],
  }),
  webhookTrigger({
    slug: 'contactCreatedOrUpdated',
    label: 'Contact created or updated',
    category: 'CONTACT',
    eventTypes: ['CREATE', 'UPDATE'],
  }),
  webhookTrigger({
    slug: 'salesInvoiceCreated',
    label: 'Sales invoice created',
    category: 'INVOICE',
    eventTypes: ['CREATE'],
  }),
  webhookTrigger({
    slug: 'salesInvoiceUpdated',
    label: 'Sales invoice updated',
    category: 'INVOICE',
    eventTypes: ['UPDATE'],
  }),
  pollingTrigger({
    slug: 'bankTransactionCreated',
    label: 'Bank transaction created',
    path: '/BankTransactions',
    responseKey: 'BankTransactions',
    idKey: 'BankTransactionID',
  }),
  pollingTrigger({
    slug: 'paymentCreated',
    label: 'Payment created',
    path: '/Payments',
    responseKey: 'Payments',
    idKey: 'PaymentID',
  }),
  pollingTrigger({
    slug: 'purchaseOrderCreated',
    label: 'Purchase order created',
    path: '/PurchaseOrders',
    responseKey: 'PurchaseOrders',
    idKey: 'PurchaseOrderID',
  }),
  pollingTrigger({
    slug: 'paymentReconciled',
    label: 'Payment reconciled',
    path: '/Payments',
    responseKey: 'Payments',
    idKey: 'PaymentID',
    select(record, cursor) {
      const id = record.PaymentID;
      if (typeof id !== 'string') return false;
      const reconciled = record.IsReconciled === true;
      const previous = cursor.values[id] === true;
      cursor.values[id] = reconciled;
      return reconciled && !previous;
    },
  }),
  pollingTrigger({
    slug: 'quoteUpdated',
    label: 'Quote updated',
    path: '/Quotes',
    responseKey: 'Quotes',
    idKey: 'QuoteID',
    select(record, cursor) {
      const id = record.QuoteID;
      if (typeof id !== 'string') return false;
      const updated = Date.parse(
        typeof record.UpdatedDateUTC === 'string' ? record.UpdatedDateUTC : '',
      );
      const previous = cursor.values[id];
      cursor.values[id] = Number.isNaN(updated) ? Date.now() : updated;
      return typeof previous !== 'number' || updated > previous;
    },
  }),
  pollingTrigger({
    slug: 'billCreated',
    label: 'Bill created',
    path: '/Invoices',
    responseKey: 'Invoices',
    idKey: 'InvoiceID',
    fixedWhere: 'Type=="ACCPAY"',
    include: (record) => record.Type === 'ACCPAY',
  }),
  pollingTrigger({
    slug: 'creditNoteCreated',
    label: 'Credit note created',
    path: '/CreditNotes',
    responseKey: 'CreditNotes',
    idKey: 'CreditNoteID',
  }),
  pollingTrigger({
    slug: 'projectCreated',
    label: 'Project created',
    path: '/Projects',
    responseKey: 'items',
    idKey: 'projectId',
    base: 'projects',
  }),
  pollingTrigger({
    slug: 'quoteCreated',
    label: 'Quote created',
    path: '/Quotes',
    responseKey: 'Quotes',
    idKey: 'QuoteID',
  }),
];
