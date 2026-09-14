import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { AttioClient } from './client.js';

const objectInput = z.object({ objectId: z.string() });
const listInput = z.object({ listId: z.string() });
const webhookData = z.json();
const webhookEvent = z.object({
  id: z.object({
    workspace_id: z.string().optional(),
    meeting_id: z.string().optional(),
    call_recording_id: z.string().optional(),
    record_id: z.string().optional(),
    entry_id: z.string().optional(),
  }),
});
const webhookDelivery = z.object({ events: z.array(webhookEvent).optional() });
const webhookRegistration = z.object({
  data: z.object({ id: z.object({ webhook_id: z.string() }), secret: z.string() }),
});
type AttioWebhookState = { webhookId: string; webhookSecret: string };

function verifySignature(body: string, signature: string | null, secret: string): void {
  if (!signature || !/^[\da-f]{64}$/i.test(signature)) {
    throw new Error('Attio webhook signature is invalid.');
  }

  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'hex');

  if (!timingSafeEqual(expected, actual)) {
    throw new Error('Attio webhook signature is invalid.');
  }
}

function trigger<TInput extends z.ZodType>({
  slug,
  eventType,
  input,
  filterField,
  filterValue,
  resourcePath,
  matches,
}: {
  slug: string;
  eventType: string;
  input: TInput;
  filterField?: string;
  filterValue?: (input: z.output<TInput>) => string;
  resourcePath?: (input: z.output<TInput>, event: z.output<typeof webhookEvent>) => string;
  matches?: (value: z.output<typeof webhookData>, input: z.output<TInput>) => boolean;
}): PieceWebhookTrigger<
  TInput,
  typeof webhookData,
  Record<string, never>,
  AttioClient,
  AttioWebhookState
> {
  return {
    slug,
    description: `Trigger when an Attio ${eventType} event occurs`,
    type: 'webhook' as const,
    input,
    output: webhookData,
    async onEnable({ client, input, webhookUrl, req }) {
      const value = filterValue?.(input);
      const response = await client.request({
        method: 'POST',
        path: '/webhooks',
        body: {
          data: {
            target_url: webhookUrl,
            subscriptions: [
              {
                event_type: eventType,
                filter: filterField
                  ? { $and: [{ field: filterField, operator: 'equals', value }] }
                  : null,
              },
            ],
          },
        },
        signal: req.signal ?? undefined,
      });
      const registration = webhookRegistration.parse(response);

      return {
        webhookId: registration.data.id.webhook_id,
        webhookSecret: registration.data.secret,
      };
    },
    async onDisable({ client, state, req }) {
      await client.request({
        method: 'DELETE',
        path: `/webhooks/${state.webhookId}`,
        signal: req.signal ?? undefined,
      });
    },
    async run({ input, client, req, state }) {
      if (!req.text) throw new Error('Attio webhook raw body is unavailable.');

      const body = await req.text();

      verifySignature(body, req.headers.get('attio-signature'), state.webhookSecret);

      const event = webhookDelivery.parse(req.data).events?.[0];

      if (!event) return [];

      const value = resourcePath
        ? await client
            .request({
              path: resourcePath(input, event),
              signal: req.signal ?? undefined,
            })
            .then((result) => z.object({ data: webhookData }).parse(result).data)
        : {
            workspace_id: event.id.workspace_id ?? null,
            meeting_id: event.id.meeting_id ?? null,
            call_recording_id: event.id.call_recording_id ?? null,
          };

      if (matches && !matches(value, input)) return [];

      return [
        {
          dedupeKey: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
          data: value,
        },
      ];
    },
  };
}

export const attioTriggers = [
  trigger({
    slug: 'recordCreated',
    eventType: 'record.created',
    input: objectInput,
    filterField: 'id.object_id',
    filterValue: (input) => input.objectId,
    resourcePath: (input, event) => `/objects/${input.objectId}/records/${event.id.record_id}`,
  }),
  trigger({
    slug: 'recordUpdated',
    eventType: 'record.updated',
    input: objectInput.extend({
      filterAttribute: z.string().optional(),
      filterValue: z.string().optional(),
    }),
    filterField: 'id.object_id',
    filterValue: (input) => input.objectId,
    resourcePath: (input, event) => `/objects/${input.objectId}/records/${event.id.record_id}`,
    matches: (value, input) => {
      if (
        !input.filterAttribute ||
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value)
      ) {
        return true;
      }

      const recordValues = value.values;

      if (!recordValues || typeof recordValues !== 'object' || Array.isArray(recordValues)) {
        return false;
      }

      const values = recordValues[input.filterAttribute];

      if (!values) return false;
      if (!input.filterValue) return true;

      return JSON.stringify(values).toLowerCase().includes(input.filterValue.toLowerCase());
    },
  }),
  trigger({
    slug: 'listEntryCreated',
    eventType: 'list-entry.created',
    input: listInput,
    filterField: 'id.list_id',
    filterValue: (input) => input.listId,
    resourcePath: (input, event) => `/lists/${input.listId}/entries/${event.id.entry_id}`,
  }),
  trigger({
    slug: 'listEntryUpdated',
    eventType: 'list-entry.updated',
    input: listInput,
    filterField: 'id.list_id',
    filterValue: (input) => input.listId,
    resourcePath: (input, event) => `/lists/${input.listId}/entries/${event.id.entry_id}`,
  }),
  trigger({
    slug: 'callRecordingCreated',
    eventType: 'call-recording.created',
    input: z.object({}),
  }),
];
