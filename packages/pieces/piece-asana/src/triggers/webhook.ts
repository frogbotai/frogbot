import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { type AsanaClient, AsanaError, signal } from '../client.js';
import { gid } from '../config.js';
import { defineWebhookTrigger } from '../define.js';
import { compact, fields, story, task } from '../records.js';

export type WebhookFilter = {
  resource_type: 'task' | 'story';
  resource_subtype?: string;
  action: 'added' | 'changed' | 'removed' | 'deleted' | 'undeleted';
  fields?: string[];
};

type WebhookState = { webhookGid: string; secret: string };

/** One compact Asana event, as delivered. */
export const asanaEvent = z.looseObject({
  action: z.string(),
  created_at: z.string().optional(),
  resource: compact.extend({ resource_subtype: z.string().optional() }),
  parent: compact.nullish(),
  user: compact.nullish(),
  change: z.looseObject({ field: z.string(), action: z.string() }).nullish(),
});

export type AsanaEvent = z.output<typeof asanaEvent>;

const delivery = z.object({ events: z.array(asanaEvent).default([]) });

const created = z.object({
  data: z.object({ gid: z.string() }),
  'X-Hook-Secret': z.string().optional(),
});

const output = z.object({
  event: asanaEvent,
  task: task.optional(),
  story: story.optional(),
});

type Output = z.output<typeof output>;

function signed(body: Buffer, signature: string | null, secret: string) {
  if (!signature || !/^[\da-f]{64}$/i.test(signature)) return false;

  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function matches(event: AsanaEvent, filter: WebhookFilter) {
  return (
    event.resource.resource_type === filter.resource_type &&
    event.action === filter.action &&
    (filter.resource_subtype === undefined ||
      event.resource.resource_subtype === filter.resource_subtype) &&
    (filter.fields === undefined ||
      (event.change ? filter.fields.includes(event.change.field) : false))
  );
}

async function enrich(client: AsanaClient, event: AsanaEvent, abort?: AbortSignal) {
  const read = <T>(schema: z.ZodType<T>, path: string, optFields: readonly string[]) =>
    client.data(schema, { path, query: { opt_fields: optFields }, signal: abort });

  if (event.resource.resource_type === 'task') {
    return { event, task: await read(task, `/tasks/${event.resource.gid}`, fields.task) };
  }

  const comment = await read(story, `/stories/${event.resource.gid}`, fields.story);
  const taskGid = event.parent?.gid ?? comment.target?.gid;

  return {
    event,
    story: comment,
    ...(taskGid ? { task: await read(task, `/tasks/${taskGid}`, fields.task) } : {}),
  };
}

/**
 * A trigger backed by one Asana webhook on a project, filtered to `filter`. Each event is emitted
 * with its full task (and story), or as delivered when Asana can't return them; `accept` drops
 * fetched events the filter can't express.
 */
export function webhookTrigger<const TSlug extends string>({
  slug,
  description,
  filter,
  accept,
}: {
  slug: TSlug;
  description: string;
  filter: WebhookFilter;
  accept?: (data: Output) => boolean;
}) {
  return defineWebhookTrigger({
    slug,
    description,
    type: 'webhook',
    input: z.object({ projectGid: gid('Project') }),
    output,
    async onEnable({ client, input, webhookUrl, req }): Promise<WebhookState> {
      const result = created.parse(
        await client.json({
          method: 'POST',
          path: '/webhooks',
          body: { resource: input.projectGid, target: webhookUrl, filters: [filter] },
          signal: signal(req),
        }),
      );

      const secret = result['X-Hook-Secret'];

      if (!secret) {
        await client
          .json({ method: 'DELETE', path: `/webhooks/${result.data.gid}` })
          .catch(() => undefined);

        throw new Error('Asana created the webhook without returning its X-Hook-Secret.');
      }

      return { webhookGid: result.data.gid, secret };
    },
    async onDisable({ client, state, req }) {
      try {
        await client.json({
          method: 'DELETE',
          path: `/webhooks/${state.webhookGid}`,
          signal: signal(req),
        });
      } catch (error) {
        if (!(error instanceof AsanaError && error.status === 404)) throw error;
      }
    },
    async run({ client, req, state }) {
      if (!req.arrayBuffer) throw new Error('Asana webhook raw body is unavailable.');

      const body = Buffer.from(await req.arrayBuffer());

      if (!signed(body, req.headers.get('x-hook-signature'), state.secret)) {
        throw new Error('Asana webhook signature is invalid.');
      }

      const events = delivery.parse(req.data).events.filter((event) => matches(event, filter));
      const results = [];

      for (const event of events) {
        const dedupeKey = createHash('sha256').update(JSON.stringify(event)).digest('hex');
        let data: Output;

        try {
          data = await enrich(client, event, signal(req));
        } catch (error) {
          if (req.signal?.aborted) throw req.signal.reason ?? error;

          results.push({ dedupeKey, data: { event } });
          continue;
        }

        if (!accept || accept(data)) results.push({ dedupeKey, data });
      }

      return results;
    },
  });
}
