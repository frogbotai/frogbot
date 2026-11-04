import { AsyncLocalStorage } from 'node:async_hooks';

import type { Job, RunInlineTaskFunction } from 'payload';

import type { Foreach, Parallel, StepRetries, StepTaskArgs } from './types.js';

type StepTask = (args: StepTaskArgs) => { output: object } | Promise<{ output: object }>;

type Scope = { id: string; inlineTask: RunInlineTaskFunction; names: Set<string> };

const running = new AsyncLocalStorage<Scope & { jobId: string; label: string }>();

export function runningStep(jobId: string): string | undefined {
  const step = running.getStore();

  return step?.jobId === jobId ? step.label : undefined;
}

async function pool<T>(count: number, concurrency: number, run: (index: number) => Promise<T>) {
  const outputs = new Array<T>(count);
  let next = 0;
  let failure: { error: unknown } | undefined;

  const worker = async () => {
    while (!failure && next < count) {
      const index = next++;

      try {
        outputs[index] = await run(index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker));

  if (failure) throw failure.error;

  return outputs;
}

export function createSteps({ job, inlineTask }: { job: Job; inlineTask: RunInlineTaskFunction }): {
  foreach: Foreach;
  parallel: Parallel;
} {
  const jobId = String(job.id);
  const top: Scope = { id: '', inlineTask, names: new Set() };

  const claim = (helper: string, name: unknown): Scope => {
    if (typeof name !== 'string' || !name.trim() || name.includes(':')) {
      throw new Error(`FrogBot ${helper} name must be a nonempty string without ':'.`);
    }

    const step = running.getStore();
    const scope = step?.jobId === jobId ? step : top;

    if (scope.names.has(name)) throw new Error(`FrogBot ${helper} name '${name}' is duplicated.`);

    scope.names.add(name);

    return scope;
  };

  const run = ({
    scope,
    helper,
    name,
    keys,
    tasks,
    concurrency,
    retries,
  }: {
    scope: Scope;
    helper: 'foreach' | 'parallel';
    name: string;
    keys: string[];
    tasks: StepTask[];
    concurrency: number;
    retries: StepRetries;
  }) => {
    const part = helper === 'foreach' ? 'item' : 'branch';

    return pool(keys.length, concurrency, (index) => {
      const id = `${scope.id && `${scope.id}:`}${name}:${keys[index]}`;

      return scope.inlineTask(id, {
        retries,
        task: ({ inlineTask, job, req, tasks: taskFunctions }) =>
          running.run(
            {
              jobId,
              label: `${helper} '${name}' ${part} '${keys[index]}'`,
              id,
              inlineTask,
              names: new Set(),
            },
            () => tasks[index]({ inlineTask, job, req, tasks: taskFunctions }),
          ),
      });
    });
  };

  const uniqueKeys = (helper: string, name: string, keys: unknown[]) => {
    const seen = new Set<string>();

    return keys.map((key, index) => {
      if (
        !(typeof key === 'string' && key !== '') &&
        !(typeof key === 'number' && Number.isFinite(key))
      ) {
        throw new Error(
          `FrogBot ${helper} '${name}' key ${typeof key === 'string' ? JSON.stringify(key) : String(key)} at index ${index} must be a nonempty string or a finite number.`,
        );
      }

      const id = String(key);

      if (seen.has(id)) throw new Error(`FrogBot ${helper} '${name}' key '${id}' is duplicated.`);

      seen.add(id);

      return id;
    });
  };

  const foreach = (async (
    name: string,
    items: readonly unknown[],
    {
      key,
      task,
      concurrency = 1,
      retries,
    }: {
      key: (item: unknown) => unknown;
      task: (args: StepTaskArgs & { item: unknown }) => ReturnType<StepTask>;
      concurrency?: number;
      retries?: StepRetries;
    },
  ) => {
    const scope = claim('foreach', name);

    if (!Array.isArray(items)) throw new Error(`FrogBot foreach '${name}' items must be an array.`);

    if (typeof key !== 'function' || typeof task !== 'function') {
      throw new Error(`FrogBot foreach '${name}' requires key and task functions.`);
    }

    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error(`FrogBot foreach '${name}' concurrency must be a positive integer.`);
    }

    return run({
      scope,
      helper: 'foreach',
      name,
      keys: uniqueKeys(
        'foreach',
        name,
        items.map((item) => key(item)),
      ),
      tasks: items.map((item) => (args: StepTaskArgs) => task({ ...args, item })),
      concurrency,
      retries,
    });
  }) as Foreach;

  const parallel = (async (
    name: string,
    branches: Record<string, StepTask>,
    { retries }: { retries?: StepRetries } = {},
  ) => {
    const scope = claim('parallel', name);

    if (typeof branches !== 'object' || branches === null || Array.isArray(branches)) {
      throw new Error(`FrogBot parallel '${name}' branches must be an object of functions.`);
    }

    const entries = Object.entries(branches);

    for (const [branch, task] of entries) {
      if (typeof task !== 'function') {
        throw new Error(`FrogBot parallel '${name}' branch '${branch}' must be a function.`);
      }
    }

    const keys = uniqueKeys(
      'parallel',
      name,
      entries.map(([branch]) => branch),
    );

    const outputs = await run({
      scope,
      helper: 'parallel',
      name,
      keys,
      tasks: entries.map(([, task]) => task),
      concurrency: Math.max(entries.length, 1),
      retries,
    });

    return Object.fromEntries(keys.map((branch, index) => [branch, outputs[index]]));
  }) as Parallel;

  return { foreach, parallel };
}
