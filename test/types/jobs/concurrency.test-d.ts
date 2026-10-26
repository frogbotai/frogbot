import type { JobsConfig, TaskConfig, WorkflowConfig } from 'frogbot';
import type { TaskConfig as PayloadTaskConfig } from 'payload';

type Input = { input: { pageId: number }; output: object };

export const keyed: TaskConfig<Input> = {
  slug: 'keyed',
  concurrency: ({ input }) => `page:${input.pageId}`,
  handler: () => ({ output: {} }),
};

export const superseding: TaskConfig<Input> = {
  slug: 'superseding',
  concurrency: { key: ({ input }) => `page:${input.pageId}`, supersedes: true },
  handler: () => ({ output: {} }),
};

export const exclusiveTask: TaskConfig<Input> = {
  slug: 'exclusive-task',
  // @ts-expect-error `exclusive` is not an option: a key always means one job at a time.
  concurrency: { key: ({ input }) => `page:${input.pageId}`, exclusive: true },
  handler: () => ({ output: {} }),
};

export const exclusiveWorkflow: WorkflowConfig<{ pageId: number }> = {
  slug: 'exclusive-workflow',
  // @ts-expect-error `exclusive` is not an option: a key always means one job at a time.
  concurrency: { key: ({ input }) => `page:${input.pageId}`, exclusive: true },
  handler: async () => {},
};

export const keyedWorkflow: WorkflowConfig<{ pageId: number }> = {
  slug: 'keyed-workflow',
  concurrency: { key: ({ input }) => `page:${input.pageId}`, supersedes: true },
  handler: async () => {},
};

declare const payloadTask: PayloadTaskConfig<Input>;

export const jobs: JobsConfig = {
  tasks: [keyed, superseding, payloadTask],
  workflows: [keyedWorkflow],
};
