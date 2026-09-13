import { createHash } from 'node:crypto';

import type { Frogbot } from '../frogbot.js';
import { AGENT_TRIGGER_TASK_SLUG } from './task.js';
import type { TriggerEvent, TriggerSubscriber } from './types.js';

export async function dispatchTriggerEvents({
  events,
  frogbot,
  subscribers,
}: {
  events: TriggerEvent[];
  frogbot: Frogbot;
  subscribers: TriggerSubscriber[];
}): Promise<void> {
  for (const event of events) {
    for (const subscriber of subscribers) {
      const identity = createHash('sha256')
        .update(
          JSON.stringify([
            subscriber.agentSlug,
            subscriber.piece.slug,
            subscriber.trigger.trigger.slug,
            event.dedupeKey,
          ]),
        )
        .digest('hex');
      const key = `trigger:dedupe:${identity}`;

      await frogbot.kv.lock(`${key}:lock`, 60_000, async ({ signal }) => {
        if (await frogbot.kv.has(key)) return;

        signal.throwIfAborted();
        await frogbot.queue({
          task: AGENT_TRIGGER_TASK_SLUG,
          queue: `frogbot-trigger:${subscriber.agentSlug}:${subscriber.trigger.trigger.slug}`,
          input: {
            agentSlug: subscriber.agentSlug,
            instanceSlug: subscriber.piece.slug,
            triggerSlug: subscriber.trigger.trigger.slug,
            event,
          },
        });

        signal.throwIfAborted();
        await frogbot.kv.setIfAbsent(key, true, { ttl: 86_400_000 });
      });
    }
  }
}
