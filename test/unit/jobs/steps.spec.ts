import type { Job, PayloadRequest, RunInlineTaskFunction } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { createSteps } from '../../../packages/frogbot/src/jobs/waitpoints/steps.js';
import { createWaitFor } from '../../../packages/frogbot/src/jobs/waitpoints/waitFor.js';

const job = { id: 1, workflowSlug: 'steps' } as unknown as Job;
const req = {} as PayloadRequest;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function runner(saved = new Map<string, object>()) {
  const log: { id: string; state: 'started' | 'succeeded' | 'failed' }[] = [];
  let active = 0;
  let peak = 0;

  const inlineTask = (async (id, { task }) => {
    if (saved.has(id)) return saved.get(id);

    log.push({ id, state: 'started' });
    active++;
    peak = Math.max(peak, active);

    try {
      const { output } = await task({ inlineTask, input: undefined as never, job, req, tasks: {} });

      saved.set(id, output);
      log.push({ id, state: 'succeeded' });

      return output;
    } catch (error) {
      log.push({ id, state: 'failed' });
      throw error;
    } finally {
      active--;
    }
  }) as RunInlineTaskFunction;

  return {
    saved,
    log,
    peak: () => peak,
    started: () => log.filter(({ state }) => state === 'started').map(({ id }) => id),
    ...createSteps({ job, inlineTask }),
  };
}

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('foreach', () => {
  it('returns outputs in input order and restores saved items by key', async () => {
    const first = runner();
    const gates = [deferred(), deferred(), deferred()];
    const done = first.foreach('double', [1, 2, 3], {
      key: (n) => n,
      concurrency: 3,
      task: async ({ item }) => {
        await gates[item - 1].promise;

        return { output: { n: item * 2 } };
      },
    });

    for (const gate of [...gates].reverse()) gate.resolve();

    await expect(done).resolves.toEqual([{ n: 2 }, { n: 4 }, { n: 6 }]);

    const second = runner(first.saved);

    await expect(
      second.foreach('double', [4, 2], {
        key: (n) => n,
        task: ({ item }) => ({ output: { n: item * 2 } }),
      }),
    ).resolves.toEqual([{ n: 8 }, { n: 4 }]);
    expect(second.started()).toEqual(['double:4']);
  });

  it('runs one item at a time by default', async () => {
    const steps = runner();

    await steps.foreach('one', ids, {
      key: (id) => id,
      task: async ({ item }) => {
        await Promise.resolve();

        return { output: { item } };
      },
    });

    expect(steps.peak()).toBe(1);
  });

  it('keeps at most concurrency items running and refills as each finishes', async () => {
    const steps = runner();
    const gates = Object.fromEntries(ids.map((id) => [id, deferred()]));
    const done = steps.foreach('slow', ids, {
      key: (id) => id,
      concurrency: 2,
      task: async ({ item }) => {
        await gates[item].promise;

        return { output: { item } };
      },
    });

    expect(steps.started()).toEqual(['slow:a', 'slow:b']);

    gates.b.resolve();

    await vi.waitFor(() => {
      expect(steps.started()).toEqual(['slow:a', 'slow:b', 'slow:c']);
    });

    for (const id of ids) gates[id].resolve();

    await expect(done).resolves.toHaveLength(6);
    expect(steps.peak()).toBe(2);
  });

  it('stops starting items on failure, settles running ones, then rethrows the first error', async () => {
    const steps = runner();
    const gates = Object.fromEntries(ids.map((id) => [id, deferred()]));
    const done = steps.foreach('fail', ids, {
      key: (id) => id,
      concurrency: 3,
      task: async ({ item }) => {
        if (item === 'b') throw new Error('b broke');

        if (item === 'c') throw new Error('c broke later');

        await gates[item].promise;

        return { output: { item } };
      },
    });

    let settled = false;

    void done.catch(() => {
      settled = true;
    });

    await vi.waitFor(() => {
      expect(steps.log).toContainEqual({ id: 'fail:c', state: 'failed' });
    });

    expect(settled).toBe(false);

    gates.a.resolve();

    await expect(done).rejects.toThrow('b broke');
    expect(steps.started()).toEqual(['fail:a', 'fail:b', 'fail:c']);
    expect([...steps.saved.keys()]).toEqual(['fail:a']);
  });

  it('resolves to an empty array for no items', async () => {
    const steps = runner();

    await expect(
      steps.foreach('none', [], { key: String, task: () => ({ output: {} }) }),
    ).resolves.toEqual([]);
  });

  it.each<[string, { items?: (string | number)[]; concurrency?: number; name?: string }, string]>([
    ['an empty key', { items: ['a', ''] }, 'key "" at index 1 must be a nonempty string'],
    ['a NaN key', { items: [Number.NaN] }, 'key NaN at index 0 must be a nonempty string'],
    ['a duplicate key', { items: [1, '1'] }, "key '1' is duplicated"],
    ['a zero concurrency', { concurrency: 0 }, 'concurrency must be a positive integer'],
    ['a fractional concurrency', { concurrency: 1.5 }, 'concurrency must be a positive integer'],
    ['a name with a colon', { name: 'a:b' }, "name must be a nonempty string without ':'"],
    ['an empty name', { name: ' ' }, "name must be a nonempty string without ':'"],
  ])(
    'rejects %s before running any item',
    async (_, { items = ['a'], concurrency, name = 'ok' }, message) => {
      const steps = runner();

      await expect(
        steps.foreach(name, items, {
          key: (item) => item,
          concurrency,
          task: () => ({ output: {} }),
        }),
      ).rejects.toThrow(message);
      expect(steps.log).toEqual([]);
    },
  );

  it('rejects a name reused across foreach and parallel', async () => {
    const steps = runner();

    await steps.foreach('sync', ['a'], { key: (id) => id, task: () => ({ output: {} }) });

    await expect(steps.parallel('sync', { b: () => ({ output: {} }) })).rejects.toThrow(
      "FrogBot parallel name 'sync' is duplicated.",
    );
    await expect(
      steps.foreach('sync', ['c'], { key: (id) => id, task: () => ({ output: {} }) }),
    ).rejects.toThrow("FrogBot foreach name 'sync' is duplicated.");
    expect(steps.started()).toEqual(['sync:a']);
  });
});

describe('parallel', () => {
  it('starts every branch at once and returns outputs by branch name', async () => {
    const steps = runner();
    const gate = deferred();
    const done = steps.parallel('fetch', {
      crm: async () => {
        await gate.promise;

        return { output: { contacts: 3 } };
      },
      billing: () => ({ output: { paid: true } }),
    });

    expect(steps.started()).toEqual(['fetch:crm', 'fetch:billing']);

    gate.resolve();

    await expect(done).resolves.toEqual({ crm: { contacts: 3 }, billing: { paid: true } });
  });

  it('settles running branches before rethrowing', async () => {
    const steps = runner();
    const gate = deferred();
    const done = steps.parallel('fetch', {
      crm: async () => {
        await gate.promise;

        return { output: { contacts: 3 } };
      },
      billing: () => {
        throw new Error('billing down');
      },
    });

    let settled = false;

    void done.catch(() => {
      settled = true;
    });

    await vi.waitFor(() => {
      expect(steps.log).toContainEqual({ id: 'fetch:billing', state: 'failed' });
    });

    expect(settled).toBe(false);

    gate.resolve();

    await expect(done).rejects.toThrow('billing down');
    expect([...steps.saved.keys()]).toEqual(['fetch:crm']);
  });

  it('resolves to an empty object for no branches', async () => {
    await expect(runner().parallel('none', {})).resolves.toEqual({});
  });

  it('rejects an empty branch name before running any branch', async () => {
    const steps = runner();

    await expect(
      steps.parallel('fetch', { crm: () => ({ output: {} }), '': () => ({ output: {} }) }),
    ).rejects.toThrow('FrogBot parallel \'fetch\' key "" at index 1');
    expect(steps.log).toEqual([]);
  });
});

describe('waitFor inside a step', () => {
  const config = { defaultExpiresIn: 1000, maxExpiresIn: 2000 };

  it('fails the item with a message naming it', async () => {
    const steps = runner();
    const { waitFor } = createWaitFor({ job, req, config });

    await expect(
      steps.foreach('approve', ['inv_1'], {
        key: (id) => id,
        task: async () => {
          await waitFor('approval', { until: new Date() });

          return { output: {} };
        },
      }),
    ).rejects.toThrow("FrogBot waitFor can't run inside foreach 'approve' item 'inv_1'.");

    await expect(
      steps.parallel('fetch', {
        crm: async () => {
          await waitFor('approval', { until: new Date() });

          return { output: {} };
        },
      }),
    ).rejects.toThrow("FrogBot waitFor can't run inside parallel 'fetch' branch 'crm'.");
  });

  it('does not block another job run from inside an item', async () => {
    const steps = runner();
    const other = createWaitFor({
      job: { id: 2, workflowSlug: 'steps' } as unknown as Job,
      req,
      config,
    });

    await expect(
      steps.foreach('nested', ['a'], {
        key: (id) => id,
        task: async () => {
          await other.waitFor('', { until: new Date() });

          return { output: {} };
        },
      }),
    ).rejects.toThrow('FrogBot waitFor name must be a nonempty string.');
  });
});
