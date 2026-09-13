import type { JobsConfig, WorkflowConfig, WorkflowHandler } from 'frogbot';
import { expectTypeOf } from 'vitest';

type Args = Parameters<WorkflowHandler>[0];
type WaitOptions = Parameters<Args['waitFor']>[1];

expectTypeOf<keyof Args>().toEqualTypeOf<'inlineTask' | 'job' | 'req' | 'tasks' | 'waitFor'>();
expectTypeOf<{ onWait: () => void; expiresIn: number }>().toMatchTypeOf<WaitOptions>();
expectTypeOf<{ onWait: () => void; expiresIn: string }>().not.toMatchTypeOf<WaitOptions>();
expectTypeOf<{ onWait: () => void; until: Date }>().not.toMatchTypeOf<WaitOptions>();

export const workflow: WorkflowConfig<{ value: string }> = {
  slug: 'typed',
  handler: async ({ job, waitFor }) => {
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
  },
};

export const jobs: JobsConfig = { workflows: [workflow] };
