import type { JobsConfig, TaskConfig } from 'payload';

import { getFrogBotInstance } from '../instanceRegistry.js';
import { getChannelHost } from './host.js';
import { CHANNEL_QUESTION_UPDATE_TASK_SLUG, CHANNEL_TASK_SLUG } from './queueChannelTask.js';
import type { ChannelTaskInput } from './types.js';

type ChannelTask = {
  input: ChannelTaskInput;
  output: Record<string, never>;
};

const QUESTION_UPDATE_RETRIES = {
  attempts: 10,
  backoff: { type: 'exponential' as const, delay: 5_000 },
};

export function resolveChannelTask(jobs?: JobsConfig): JobsConfig {
  const handler: TaskConfig<ChannelTask>['handler'] = async ({ input, req }) => {
    const frogbot = getFrogBotInstance(req.payload);

    const host = frogbot ? getChannelHost(frogbot) : undefined;

    if (!host) {
      throw new Error('[frogbot] Channel task requires an initialized channel host.');
    }

    await host.run(input, req.signal ?? undefined);

    return { output: {} };
  };

  const tasks: TaskConfig<ChannelTask>[] = [
    { slug: CHANNEL_TASK_SLUG, handler },
    { slug: CHANNEL_QUESTION_UPDATE_TASK_SLUG, handler, retries: QUESTION_UPDATE_RETRIES },
  ];

  return { ...jobs, tasks: [...(jobs?.tasks ?? []), ...tasks] };
}
