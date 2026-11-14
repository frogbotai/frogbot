import { describe, expect, it, vi } from 'vitest';

import {
  createBuildQueue,
  type RunKind,
} from '../../../../../packages/frogbot/src/bin/service/queue.js';

function blockingRun() {
  const runs: RunKind[] = [];
  let release = () => {};

  let running = 0;
  let most = 0;

  const run = vi.fn(async (kind: RunKind) => {
    runs.push(kind);
    running++;
    most = Math.max(most, running);
    await new Promise<void>((resolve) => (release = resolve));
    running--;
  });

  return { run, runs, release: () => release(), most: () => most };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('the build queue', () => {
  it('runs an update by default', async () => {
    const { run, runs, release } = blockingRun();
    const queue = createBuildQueue(run);

    queue.trigger();
    release();
    await queue.idle();

    expect(runs).toEqual(['update']);
  });

  it('lets an update win over a restart waiting with it', async () => {
    const { run, runs, release } = blockingRun();
    const queue = createBuildQueue(run);

    queue.trigger('update');
    queue.trigger('restart');
    queue.trigger('update');
    queue.trigger('restart');
    release();
    await tick();
    release();
    await queue.idle();

    expect(runs).toEqual(['update', 'update']);
  });

  it('runs a restart that waited alone behind a build', async () => {
    const { run, runs, release } = blockingRun();
    const queue = createBuildQueue(run);

    queue.trigger('update');
    queue.trigger('restart');
    queue.trigger('restart');
    release();
    await tick();
    release();
    await queue.idle();

    expect(runs).toEqual(['update', 'restart']);
  });

  it('never overlaps runs, and keeps going after one throws', async () => {
    const runs: RunKind[] = [];
    let running = 0;
    let most = 0;
    const queue = createBuildQueue(async (kind) => {
      runs.push(kind);
      running++;
      most = Math.max(most, running);
      await tick();
      running--;

      if (runs.length === 1) throw new Error('build failed');
    });

    queue.trigger('restart');
    queue.trigger('update');
    await queue.idle();

    expect(runs).toEqual(['restart', 'update']);
    expect(most).toBe(1);
    expect(queue.busy).toBe(false);
  });
});
