import type { JobsConfig, WorkflowConfig, WorkflowHandler } from 'frogbot';
import { expectTypeOf } from 'vitest';

type Args = Parameters<WorkflowHandler>[0];

type WaitOptions = Parameters<Args['waitFor']>[1];

expectTypeOf<keyof Args>().toEqualTypeOf<
  'foreach' | 'inlineTask' | 'job' | 'parallel' | 'req' | 'tasks' | 'waitFor'
>();

expectTypeOf<{ onWait: () => void; expiresIn: number }>().toMatchTypeOf<WaitOptions>();
expectTypeOf<{ onWait: () => void; expiresIn: string }>().not.toMatchTypeOf<WaitOptions>();
expectTypeOf<{ onWait: () => void; until: Date }>().not.toMatchTypeOf<WaitOptions>();

export const workflow: WorkflowConfig<{ value: string }> = {
  slug: 'typed',
  handler: async ({ job, waitFor, foreach, parallel }) => {
    expectTypeOf(job.input).toEqualTypeOf<{ value: string }>();

    const delayed = await waitFor('delay', { until: new Date() });

    expectTypeOf(delayed).toEqualTypeOf<void>();

    const result = await waitFor<{ approved: boolean }>('approval', {
      expiresIn: 1000,
      onWait: ({ resumeUrl }) => {
        expectTypeOf(resumeUrl).toEqualTypeOf<string>();
      },
    });

    expectTypeOf(result).toEqualTypeOf<
      { expired: false; data: { approved: boolean } } | { expired: true }
    >();

    if (!result.expired) expectTypeOf(result.data).toEqualTypeOf<{ approved: boolean }>();

    const pushed = await foreach('push', [{ id: 'a', total: 1 }], {
      key: (invoice) => invoice.id,
      concurrency: 2,
      retries: 1,
      task: ({ item, inlineTask, req }) => {
        expectTypeOf(item).toEqualTypeOf<{ id: string; total: number }>();
        expectTypeOf(inlineTask).toBeFunction();
        expectTypeOf(req.payload).not.toBeAny();

        return { output: { total: item.total } };
      },
    });

    expectTypeOf(pushed).toEqualTypeOf<{ total: number }[]>();

    const fetched = await parallel('fetch', {
      crm: () => ({ output: { contacts: 3 } }),
      billing: () => Promise.resolve({ output: { paid: true } }),
    });

    expectTypeOf(fetched).toEqualTypeOf<{
      crm: { contacts: number };
      billing: { paid: boolean };
    }>();

    await foreach('bad', [1], {
      // @ts-expect-error keys are strings or numbers
      key: () => true,
      task: () => ({ output: {} }),
    });
  },
};

export const jobs: JobsConfig = { workflows: [workflow] };
