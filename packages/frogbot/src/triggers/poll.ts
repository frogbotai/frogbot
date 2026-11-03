import { createHash } from 'node:crypto';

import type { JobsConfig, TaskConfig } from 'payload';

import type { FrogBot } from '../frogbot.js';
import { getFrogBotInstance } from '../instanceRegistry.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import { TRIGGER_SUBSCRIPTIONS_SLUG } from './collection.js';
import { dispatchTriggerEvents } from './dispatch.js';
import {
  decodeSubscriptionCursor,
  encodeSubscriptionCursor,
  parseSubscriptionInput,
} from './input.js';
import type { Subscription } from './subscriptions.js';
import type { IngressRegistry } from './types.js';

export const TRIGGER_POLL_TASK_SLUG = 'frogbot-poll-trigger';

type PollJob = { agentSlug: string; instanceSlug: string; triggerSlug: string };

type PollTask = { input: PollJob; output: Record<string, never> };

export function resolvePollTasks({
  registry,
  jobs,
}: {
  registry: IngressRegistry;
  jobs?: JobsConfig;
}): JobsConfig | undefined {
  const polling = Object.values(registry).flatMap(({ subscribers }) =>
    subscribers.flatMap((subscriber) =>
      subscriber.cron === undefined ? [] : [{ subscriber, cron: subscriber.cron }],
    ),
  );

  if (!polling.length) return jobs;

  const task: TaskConfig<PollTask> = {
    slug: TRIGGER_POLL_TASK_SLUG,
    interfaceName: 'TaskFrogBotPollTrigger',
    schedule: polling.map(({ subscriber, cron }) => {
      const input: PollJob = {
        agentSlug: subscriber.agentSlug,
        instanceSlug: subscriber.piece.slug,
        triggerSlug: subscriber.trigger.trigger.slug,
      };

      return {
        cron,
        queue: `frogbot-poll:${input.agentSlug}:${input.instanceSlug}:${input.triggerSlug}`,
        hooks: {
          beforeSchedule: async ({ defaultBeforeSchedule, ...args }) => ({
            ...(await defaultBeforeSchedule({ defaultBeforeSchedule, ...args })),
            input,
          }),
        },
      };
    }),
    handler: async ({ input, req }) => {
      const frogbot = getFrogBotInstance(req.payload);

      if (frogbot) await poll(frogbot, input);

      return { output: {} };
    },
  };

  return { ...jobs, tasks: [...(jobs?.tasks ?? []), task] };
}

async function poll(frogbot: FrogBot, { agentSlug, instanceSlug, triggerSlug }: PollJob) {
  const subscriber = frogbot.config._internal.triggers[instanceSlug]?.subscribers.find(
    (candidate) =>
      candidate.cron !== undefined &&
      candidate.agentSlug === agentSlug &&
      candidate.trigger.trigger.slug === triggerSlug,
  );

  if (!subscriber) return;

  const { docs } = await frogbot.find({
    collection: TRIGGER_SUBSCRIPTIONS_SLUG,
    where: {
      and: [
        { agent: { equals: agentSlug } },
        { instance: { equals: instanceSlug } },
        { trigger: { equals: triggerSlug } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const row = (docs as Subscription[])[0];

  if (!row) return;

  const write = async (data: Partial<Pick<Subscription, 'state' | 'status'>>) => {
    const { errors } = await frogbot.update({
      collection: TRIGGER_SUBSCRIPTIONS_SLUG,
      where: {
        and: [{ id: { equals: row.id } }, { inputHash: { equals: row.inputHash } }],
      },
      data,
      depth: 0,
      overrideAccess: true,
    });

    if (errors.length) throw new Error(errors[0]?.message);
  };

  try {
    const runtime = pieceInstanceRuntime(subscriber.piece);
    const trigger = runtime.definition.triggers?.find(
      (candidate) => candidate.slug === triggerSlug,
    );

    if (trigger?.type !== 'polling') {
      throw new Error(`Trigger '${instanceSlug}/${triggerSlug}' is not a polling trigger.`);
    }

    const req = await frogbot.createRequest({
      context: { trigger: { piece: instanceSlug, trigger: triggerSlug, agent: agentSlug } },
    });

    const cursor = decodeSubscriptionCursor(row.state);

    const result = await trigger.run({
      input: parseSubscriptionInput({ schema: trigger.input, input: row.input }),
      cursor,
      client: await runtime.client({ req }),
      options: runtime.options,
      req,
    });

    if (row.state != null) {
      await dispatchTriggerEvents({
        events: result.events.map((data) => ({
          dedupeKey: createHash('sha256')
            .update(JSON.stringify([row.id, data]))
            .digest('hex'),
          data,
        })),
        frogbot,
        subscribers: [subscriber],
      });
    }

    await write({
      state: encodeSubscriptionCursor(result.cursor === undefined ? cursor : result.cursor),
      status: 'active',
    });
  } catch (error) {
    await write({ status: 'error' }).catch(() => undefined);

    frogbot.logger.warn(
      `[frogbot] Poll of trigger '${instanceSlug}/${triggerSlug}' for agent '${agentSlug}' failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
