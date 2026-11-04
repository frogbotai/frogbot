import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowHandler } from '../../packages/frogbot/dist/jobs/types.js';
import { adapterName, bootJobsFixture, deferred, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let handler: WorkflowHandler;
let calls: string[] = [];

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      workflows: [
        {
          slug: 'steps',
          queue: 'steps',
          handler: (args) => handler(args),
        },
        {
          slug: 'steps-no-retries',
          queue: 'steps',
          retries: 0,
          handler: (args) => handler(args),
        },
      ],
    },
  });
});

afterEach(async () => {
  calls = [];

  await fixture.payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
  await fixture.payload.db.deleteMany({ collection: 'frogbot-waitpoints', where: {} });
});

afterAll(async () => fixture?.shutdown());

async function run(id: number | string) {
  await fixture.frogbot.jobs.runByID({ id, silent: true, overrideAccess: true });

  const result = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
    pagination: false,
  });

  return result.docs[0];
}

async function start(workflow: WorkflowHandler, slug = 'steps') {
  handler = workflow;

  const { id } = await fixture.frogbot.jobs.queue({
    workflow: slug as 'steps',
    input: {},
    overrideAccess: true,
  });

  return { id, job: await run(id) };
}

function entries(job: FrogBotJob) {
  return (job.log ?? []).map(({ state, taskID }) => `${state}:${taskID}`);
}

describe(`durable foreach and parallel: ${adapterName}`, () => {
  it('a retry runs only the failed item and those after it, returning every output in order', async () => {
    let failures = 0;
    let outputs: unknown;

    const { id, job } = await start(async ({ foreach }) => {
      outputs = await foreach('sync', [1, 2, 3, 4, 5], {
        key: (n) => `invoice-${n}`,
        retries: 1,
        task: ({ item }) => {
          calls.push(String(item));

          if (item === 4 && failures++ === 0) throw new Error('invoice 4 rejected');

          return { output: { pushed: item } };
        },
      });
    });

    expect(job.completedAt).toBeFalsy();
    expect(calls).toEqual(['1', '2', '3', '4']);

    calls = [];

    const retried = await run(id);

    expect(calls).toEqual(['4', '5']);
    expect(retried.completedAt).toBeTruthy();
    expect(outputs).toEqual([1, 2, 3, 4, 5].map((pushed) => ({ pushed })));
  });

  it('workflow retries: 0 fails the job for good even when the item allows retries', async () => {
    const { id, job } = await start(async ({ foreach }) => {
      await foreach('sync', [1], {
        key: (n) => n,
        retries: 2,
        task: () => {
          calls.push('sync');
          throw new Error('rejected');
        },
      });
    }, 'steps-no-retries');

    expect(job.hasError).toBe(true);

    await run(id);

    expect(calls).toEqual(['sync']);
  });

  it('a helper inside an item nests under it, so a retry restores each item its own outputs', async () => {
    let failed = false;
    let outputs: unknown;

    const { id } = await start(async ({ foreach }) => {
      outputs = await foreach('outer', ['a', 'b'], {
        key: (id) => id,
        retries: 1,
        task: async ({ item }) => {
          const inner = await foreach('inner', [1, 2], {
            key: (n) => n,
            task: ({ item: n }) => {
              calls.push(`${item}${n}`);

              return { output: { v: `${item}${n}` } };
            },
          });

          if (item === 'b' && !failed) {
            failed = true;
            throw new Error('retry once');
          }

          return { output: { inner } };
        },
      });
    });

    const job = await run(id);

    expect(job.completedAt).toBeTruthy();
    expect(calls).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(entries(job)).toContain('succeeded:outer:b:inner:1');
    expect(job.log?.find(({ taskID }) => taskID === 'outer:b:inner:1')?.parent).toMatchObject({
      taskID: 'outer:b',
    });
    expect(outputs).toEqual([
      { inner: [{ v: 'a1' }, { v: 'a2' }] },
      { inner: [{ v: 'b1' }, { v: 'b2' }] },
    ]);
  });

  it('a reordered, shorter list restores by key and runs only new keys', async () => {
    let items = ['a', 'b', 'c'];
    let outputs: unknown;
    let gated = false;

    const { id } = await start(async ({ foreach, inlineTask }) => {
      outputs = await foreach('letters', items, {
        key: (letter) => letter,
        task: ({ item }) => {
          calls.push(item);

          return { output: { letter: item.toUpperCase() } };
        },
      });

      await inlineTask('gate', {
        retries: 1,
        task: () => {
          if (!gated) {
            gated = true;
            throw new Error('retry once');
          }

          return { output: {} };
        },
      });
    });

    expect(calls).toEqual(['a', 'b', 'c']);

    calls = [];
    items = ['c', 'd', 'a'];

    expect((await run(id)).completedAt).toBeTruthy();
    expect(calls).toEqual(['d']);
    expect(outputs).toEqual([{ letter: 'C' }, { letter: 'D' }, { letter: 'A' }]);
  });

  it.each<[string, (args: Parameters<WorkflowHandler>[0]) => Promise<unknown>, string]>([
    [
      'an empty key',
      ({ foreach }: Parameters<WorkflowHandler>[0]) =>
        foreach('sync', ['a', ''], { key: (id) => id, task: () => ({ output: {} }) }),
      'FrogBot foreach \'sync\' key "" at index 1 must be a nonempty string or a finite number.',
    ],
    [
      'a duplicate key',
      ({ foreach }: Parameters<WorkflowHandler>[0]) =>
        foreach('sync', ['a', 'b', 'a'], { key: (id) => id, task: () => ({ output: {} }) }),
      "FrogBot foreach 'sync' key 'a' is duplicated.",
    ],
    [
      'a reused name',
      async ({ foreach, parallel }: Parameters<WorkflowHandler>[0]) => {
        await foreach('sync', [], { key: String, task: () => ({ output: {} }) });
        await parallel('sync', { crm: () => ({ output: {} }) });
      },
      "FrogBot parallel name 'sync' is duplicated.",
    ],
    [
      'a name with a colon',
      ({ parallel }: Parameters<WorkflowHandler>[0]) =>
        parallel('sync:crm', { crm: () => ({ output: {} }) }),
      "FrogBot parallel name must be a nonempty string without ':'.",
    ],
  ])('%s throws before any item runs', async (_, workflow, message) => {
    const { job } = await start(async (args) => {
      await workflow(args);
    });

    expect(job.hasError).toBe(true);
    expect(job.error).toMatchObject({ message });
    expect(job.log ?? []).toEqual([]);
  });

  it('runs one item at a time by default', async () => {
    let active = 0;
    let peak = 0;

    const { job } = await start(async ({ foreach }) => {
      await foreach('serial', ['a', 'b', 'c'], {
        key: (id) => id,
        task: async ({ item }) => {
          peak = Math.max(peak, ++active);
          await Promise.resolve();
          active--;

          return { output: { item } };
        },
      });
    });

    expect(job.completedAt).toBeTruthy();
    expect(peak).toBe(1);
  });

  it('concurrency 2 never runs more than 2 and refills as each finishes', async () => {
    const lastStarted = deferred();
    let active = 0;
    let peak = 0;

    const { job } = await start(async ({ foreach }) => {
      await foreach('pool', ['a', 'b', 'c', 'd', 'e', 'f'], {
        key: (id) => id,
        concurrency: 2,
        task: async ({ item }) => {
          peak = Math.max(peak, ++active);
          calls.push(item);

          if (item === 'f') lastStarted.resolve();

          await (item === 'a' ? lastStarted.promise : Promise.resolve());
          active--;

          return { output: { item } };
        },
      });
    });

    expect(job.completedAt).toBeTruthy();
    expect(peak).toBe(2);
    expect(calls).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('running items save before the failure is written and do not rerun', async () => {
    const failed = deferred();
    let failures = 0;

    const { id, job } = await start(async ({ foreach }) => {
      await foreach('sync', ['a', 'b', 'c', 'd', 'e'], {
        key: (id) => id,
        concurrency: 3,
        retries: 1,
        task: async ({ item }) => {
          calls.push(item);

          if (item === 'b' && failures++ === 0) {
            failed.resolve();
            throw new Error('b rejected');
          }

          if (item !== 'b') await failed.promise;

          return { output: { item } };
        },
      });
    });

    expect(calls).toEqual(['a', 'b', 'c']);
    expect([...entries(job)].sort()).toEqual([
      'failed:sync:b',
      'succeeded:sync:a',
      'succeeded:sync:c',
    ]);
    expect(entries(job).at(-1)).toBe('failed:sync:b');

    calls = [];

    expect((await run(id)).completedAt).toBeTruthy();
    expect(calls).toEqual(['b', 'd', 'e']);
  });

  it('parallel returns outputs by branch name and settles siblings before failing', async () => {
    const failed = deferred();
    let failures = 0;
    let outputs: unknown;

    const { id, job } = await start(async ({ parallel }) => {
      outputs = await parallel(
        'fetch',
        {
          crm: async () => {
            calls.push('crm');
            await failed.promise;

            return { output: { contacts: 3 } };
          },
          billing: () => {
            calls.push('billing');

            if (failures++ === 0) {
              failed.resolve();
              throw new Error('billing down');
            }

            return { output: { paid: true } };
          },
        },
        { retries: 1 },
      );
    });

    expect(calls).toEqual(['crm', 'billing']);
    expect(entries(job)).toEqual(['succeeded:fetch:crm', 'failed:fetch:billing']);

    calls = [];

    expect((await run(id)).completedAt).toBeTruthy();
    expect(calls).toEqual(['billing']);
    expect(outputs).toEqual({ crm: { contacts: 3 }, billing: { paid: true } });
  });

  it('foreach, waitFor, then parallel reruns nothing finished after resume', async () => {
    let token = '';
    let approval: unknown;
    let outputs: unknown;

    const { id, job } = await start(async ({ foreach, parallel, waitFor }) => {
      await foreach('before', ['a', 'b'], {
        key: (id) => id,
        task: ({ item }) => {
          calls.push(item);

          return { output: {} };
        },
      });

      approval = await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3]!;
        },
      });

      outputs = await parallel('after', {
        x: () => {
          calls.push('x');

          return { output: { x: 1 } };
        },
        y: () => {
          calls.push('y');

          return { output: { y: 2 } };
        },
      });
    });

    expect(job.completedAt).toBeFalsy();
    expect(calls).toEqual(['a', 'b']);

    await fixture.worker.jobs.resume({ token, data: 'yes' });

    expect((await run(id)).completedAt).toBeTruthy();
    expect(calls).toEqual(['a', 'b', 'x', 'y']);
    expect(approval).toEqual({ expired: false, data: 'yes' });
    expect(outputs).toEqual({ x: { x: 1 }, y: { y: 2 } });
  });

  it('waitFor inside an item fails the item and names it', async () => {
    const { job } = await start(async ({ foreach, waitFor }) => {
      await foreach('approve', ['inv_1'], {
        key: (id) => id,
        task: async () => {
          await waitFor('approval', { until: new Date(Date.now() + 60_000) });

          return { output: {} };
        },
      });
    });

    expect(job.hasError).toBe(true);
    expect(entries(job)).toEqual(['failed:approve:inv_1']);
    expect(job.log?.[0]?.error).toMatchObject({
      message: "FrogBot waitFor can't run inside foreach 'approve' item 'inv_1'.",
    });

    const waitpoints = await fixture.payload.db.find({
      collection: 'frogbot-waitpoints',
      limit: 0,
    });

    expect(waitpoints.docs).toEqual([]);
  });

  it('waitFor inside a parallel branch nested in an item, after awaits, names the branch', async () => {
    const { job } = await start(async ({ foreach, parallel, waitFor }) => {
      await foreach('approve', ['inv_1'], {
        key: (id) => id,
        task: async () => {
          await Promise.resolve();

          await parallel('notify', {
            manager: async () => {
              await Promise.resolve();
              await waitFor('approval', { until: new Date(Date.now() + 60_000) });

              return { output: {} };
            },
          });

          return { output: {} };
        },
      });
    });

    expect(job.hasError).toBe(true);
    expect(job.error).toMatchObject({
      message: "FrogBot waitFor can't run inside parallel 'notify' branch 'manager'.",
    });
  });
});
