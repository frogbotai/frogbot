import { describe, expect, it } from 'vitest';

import { resolveChannelTask } from '../../../../packages/frogbot/src/channels/task.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';

describe('channel jobs', () => {
  it('fails instead of completing work without its runtime or host', async () => {
    const task = resolveChannelTask().tasks![0]!;
    const payload = {};

    if (typeof task.handler !== 'function') throw new Error('Missing task handler');

    await expect(task.handler({ input: {}, req: { payload } } as never)).rejects.toThrow(
      'initialized channel host',
    );

    registerFrogBotInstance(payload, {} as never);

    await expect(task.handler({ input: {}, req: { payload } } as never)).rejects.toThrow(
      'initialized channel host',
    );
  });
});
