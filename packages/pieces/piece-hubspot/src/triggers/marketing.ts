import { z } from 'zod';

import { type HubSpotClient, signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { type PollItem, pollWindow, schedule } from './poll.js';

const maxPages = 100;

const eventTypes = [
  'SENT',
  'DROPPED',
  'PROCESSED',
  'DELIVERED',
  'DEFERRED',
  'BOUNCE',
  'OPEN',
  'CLICK',
  'STATUSCHANGE',
  'SPAMREPORT',
] as const;

const emailEvent = z.looseObject({
  id: z.string(),
  created: z.number(),
  type: z.string(),
  recipient: z.string().optional(),
  emailCampaignId: z.number().optional(),
});

const timelineItem = z.looseObject({
  timestamp: z.number(),
  recipient: z.string(),
  portalId: z.number().optional(),
  changes: z.array(z.looseObject({ change: z.string().optional() })).optional(),
});

const offset = z.union([z.string(), z.number()]).transform(String).optional();

const eventsPage = z
  .object({ events: z.array(emailEvent), hasMore: z.boolean().optional(), offset })
  .transform((page) => ({ items: page.events, next: page.hasMore ? page.offset : undefined }));

const timelinePage = z
  .object({ timeline: z.array(timelineItem), hasMore: z.boolean().optional(), offset })
  .transform((page) => ({ items: page.timeline, next: page.hasMore ? page.offset : undefined }));

async function offsetPages<T>(
  client: HubSpotClient,
  page: z.ZodType<{ items: T[]; next: string | undefined }>,
  path: string,
  query: Record<string, string | number | undefined>,
  abort?: AbortSignal,
) {
  const items: T[] = [];
  let after: string | undefined;

  for (let pages = 0; pages < maxPages; pages++) {
    const result = await client.request(page, {
      path,
      query: { ...query, limit: 1000, offset: after },
      signal: abort,
    });

    items.push(...result.items);

    if (!result.next) break;

    after = result.next;
  }

  return items;
}

export const newEmailEvent = definePollingTrigger({
  slug: 'newEmailEvent',
  description: 'Emit each new marketing email event, optionally of one type.',
  type: 'polling',
  schedule,
  input: z.object({
    eventType: z.enum(eventTypes).optional().meta({ label: 'Event type' }),
  }),
  output: emailEvent,
  run({ client, input, cursor, req }) {
    return pollWindow(cursor, async (floor, now) => {
      const events = await offsetPages(
        client,
        eventsPage,
        '/email/public/v1/events',
        { eventType: input.eventType, startTimestamp: floor, endTimestamp: now },
        signal(req),
      );

      return events.map((event) => ({ id: event.id, epoch: event.created, event }));
    });
  },
});

export const newEmailSubscriptionsTimeline = definePollingTrigger({
  slug: 'newEmailSubscriptionsTimeline',
  description: "Emit each change to a recipient's email subscriptions.",
  type: 'polling',
  schedule,
  input: z.object({}),
  output: timelineItem,
  run({ client, cursor, req }) {
    return pollWindow(cursor, async (floor, now) => {
      const timeline = await offsetPages(
        client,
        timelinePage,
        '/email/public/v1/subscriptions/timeline',
        { startTimestamp: floor, endTimestamp: now },
        signal(req),
      );

      return timeline.map((event) => ({ id: event.recipient, epoch: event.timestamp, event }));
    });
  },
});

const submission = z.object({
  conversionId: z.string().optional(),
  submittedAt: z.number(),
  pageUrl: z.string().optional(),
  values: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

const submissionsPage = z.object({
  results: z.array(submission),
  paging: z.object({ next: z.object({ after: z.string() }).optional() }).optional(),
});

const form = z.object({
  fieldGroups: z
    .array(
      z.object({
        fields: z
          .array(z.object({ name: z.string(), label: z.string(), fieldType: z.string() }))
          .optional(),
      }),
    )
    .optional(),
});

const submissionOutput = z.object({
  conversionId: z.string().optional(),
  submittedAt: z.number(),
  pageUrl: z.string().optional(),
  values: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .meta({ description: 'Values by field label; checkboxes, and files when allowed, as arrays.' }),
});

type SubmissionOutput = z.output<typeof submissionOutput>;

export const newFormSubmission = definePollingTrigger({
  slug: 'newFormSubmission',
  description: 'Emit each new submission of a form, with its values keyed by field label.',
  type: 'polling',
  schedule,
  input: z.object({
    formId: z
      .string()
      .regex(/^[\w-]+$/, 'formId must be a HubSpot form ID.')
      .meta({ label: 'Form' }),
    allowMultipleFiles: z
      .boolean()
      .default(false)
      .meta({ label: 'Allow multiple files', description: 'Return every file field as an array.' }),
  }),
  output: submissionOutput,
  run({ client, input, cursor, req }) {
    return pollWindow(cursor, async (floor) => {
      const submissions: z.output<typeof submission>[] = [];
      let after: string | undefined;

      for (let page = 0; page < maxPages; page++) {
        const result = await client.request(submissionsPage, {
          path: `/form-integrations/v1/submissions/forms/${input.formId}`,
          query: { limit: 50, after },
          signal: signal(req),
        });

        submissions.push(...result.results);
        after = result.paging?.next?.after;

        if (!after || result.results.some((found) => found.submittedAt <= floor)) break;
      }

      const fresh = submissions.filter((found) => found.submittedAt > floor);

      if (fresh.length === 0) return [];

      const definition = await client.request(form, {
        path: `/marketing/v3/forms/${input.formId}`,
        signal: signal(req),
      });

      const fields = new Map(
        (definition.fieldGroups ?? [])
          .flatMap((group) => group.fields ?? [])
          .map((field) => [field.name, field]),
      );

      return fresh.map((found): PollItem<SubmissionOutput> => {
        const values: SubmissionOutput['values'] = {};

        for (const { name, value } of found.values ?? []) {
          const field = fields.get(name);
          const label = field?.label ?? name;
          const many =
            field?.fieldType === 'multiple_checkboxes' ||
            field?.fieldType === 'checkbox' ||
            (field?.fieldType === 'file' && input.allowMultipleFiles);

          if (many) {
            const previous = values[label];

            values[label] = [...(Array.isArray(previous) ? previous : []), value];
          } else {
            values[label] = value;
          }
        }

        return {
          id: found.conversionId ?? String(found.submittedAt),
          epoch: found.submittedAt,
          event: { ...found, values },
        };
      });
    });
  },
});
