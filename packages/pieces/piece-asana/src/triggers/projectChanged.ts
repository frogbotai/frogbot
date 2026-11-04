import { z } from 'zod';

import { type AsanaClient, AsanaError, signal } from '../client.js';
import { gid } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { asanaEvent } from './webhook.js';

const maxPages = 10;

const eventFields = [
  'action',
  'created_at',
  'type',
  'resource.name',
  'resource.resource_type',
  'resource.resource_subtype',
  'parent.name',
  'parent.resource_type',
  'user.name',
  'change.field',
  'change.action',
];

const syncCursor = z.object({ sync: z.string().min(1) });

const eventsPage = z.object({
  data: z.array(asanaEvent),
  sync: z.string().min(1),
  has_more: z.boolean().optional(),
});

const output = z.discriminatedUnion('type', [
  z.object({ type: z.literal('event'), event: asanaEvent }),
  z.object({
    type: z.literal('resync'),
    projectGid: z.string(),
    detectedAt: z.string().meta({ description: 'When the poll found its sync token expired.' }),
  }),
]);

type Output = z.output<typeof output>;

async function readEvents(
  client: AsanaClient,
  projectGid: string,
  sync: string | undefined,
  abort?: AbortSignal,
) {
  try {
    return {
      page: eventsPage.parse(
        await client.json({
          path: '/events',
          query: { resource: projectGid, sync, opt_fields: eventFields },
          signal: abort,
        }),
      ),
    };
  } catch (error) {
    if (!(error instanceof AsanaError && error.status === 412)) throw error;

    const fresh = syncCursor.safeParse(error.body);

    if (!fresh.success) throw error;

    return { expired: fresh.data.sync };
  }
}

export const projectChanged = definePollingTrigger({
  slug: 'projectChanged',
  description:
    "Poll an Asana project's Events API for every added, changed, removed or deleted task, section and story since the last poll. A resync event means changes may have been missed, so re-import the project.",
  type: 'polling',
  input: z.object({ projectGid: gid('Project') }),
  output,
  async run({ client, input, cursor, req }) {
    const previous = syncCursor.safeParse(cursor);
    let sync = previous.success ? previous.data.sync : undefined;
    const events: Output[] = [];

    for (let pages = 0; pages < maxPages; pages++) {
      const result = await readEvents(client, input.projectGid, sync, signal(req));

      if (result.expired !== undefined) {
        if (sync !== undefined) {
          events.push({
            type: 'resync',
            projectGid: input.projectGid,
            detectedAt: new Date().toISOString(),
          });
        }

        return { events, cursor: { sync: result.expired } };
      }

      sync = result.page.sync;
      events.push(...result.page.data.map((event) => ({ type: 'event' as const, event })));

      if (!result.page.has_more) break;
    }

    return { events, cursor: sync === undefined ? undefined : { sync } };
  },
});
