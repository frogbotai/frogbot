import { assert, describe, expect, it } from 'vitest';

import {
  CHANNEL_QUESTION_UPDATE_TASK_SLUG,
  CHANNEL_TASK_SLUG,
} from '../../../../packages/frogbot/src/channels/host.js';
import { resolveChannelTask } from '../../../../packages/frogbot/src/channels/task.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';

describe('channel jobs', () => {
  it('fails instead of completing work without its runtime or host', async () => {
    const task = resolveChannelTask().tasks![0];
    const payload = {};

    assert(typeof task.handler === 'function', 'Missing task handler');

    await expect(task.handler({ input: {}, req: { payload } } as never)).rejects.toThrow(
      'initialized channel host',
    );

    registerFrogBotInstance(payload, {} as never);

    await expect(task.handler({ input: {}, req: { payload } } as never)).rejects.toThrow(
      'initialized channel host',
    );
  });

  it('retries question updates with backoff and never retries channel messages', () => {
    const tasks = resolveChannelTask().tasks!;

    expect(tasks.map(({ slug, retries }) => ({ slug, retries }))).toEqual([
      { slug: CHANNEL_TASK_SLUG, retries: undefined },
      {
        slug: CHANNEL_QUESTION_UPDATE_TASK_SLUG,
        retries: { attempts: 10, backoff: { type: 'exponential', delay: 5_000 } },
      },
    ]);
  });
});
