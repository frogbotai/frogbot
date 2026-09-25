import type { JobsConfig, TaskConfig } from 'payload';

import { getFrogBotInstance } from '../instanceRegistry.js';
import { CHANNEL_TASK_SLUG, type ChannelTaskInput, getChannelHost } from './host.js';

type ChannelTask = {
  input: ChannelTaskInput;
  output: Record<string, never>;
};

export function resolveChannelTask(jobs?: JobsConfig): JobsConfig {
  const task: TaskConfig<ChannelTask> = {
    slug: CHANNEL_TASK_SLUG,
    handler: async ({ input, req }) => {
      const frogbot = getFrogBotInstance(req.payload);

      const host = frogbot ? getChannelHost(frogbot) : undefined;

      if (!host) {
        throw new Error('[frogbot] Channel task requires an initialized channel host.');
      }

      await host.run(input, req.signal ?? undefined);

      return { output: {} };
    },
  };

  return { ...jobs, tasks: [...(jobs?.tasks ?? []), task] };
}
