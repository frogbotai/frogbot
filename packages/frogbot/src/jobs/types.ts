import type {
  JobsConfig as PayloadJobsConfig,
  JsonObject,
  Payload,
  PayloadRequest,
  TypedJobs as PayloadTypedJobs,
} from 'payload';

import type { FrogbotTypes } from '../types/generated.js';
import type { FrogbotRequest } from '../types/request.js';

export type JobsConfig = Omit<PayloadJobsConfig, 'runHooks' | 'depth'> & { leaseDuration?: number };

export type UntypedJobs = {
  tasks: Record<string, { input?: JsonObject; output?: JsonObject }>;
  workflows: Record<string, { input: JsonObject }>;
};

type TypedJobs = FrogbotTypes['jobs'];

type JobTaskSlug = Extract<keyof TypedJobs['tasks'], string>;

type JobWorkflowSlug = Extract<keyof TypedJobs['workflows'], string>;

type JobSlug = JobTaskSlug | JobWorkflowSlug;

type JobRequestArgs<T> = T extends { req?: PayloadRequest }
  ? Omit<T, 'req'> & { req?: FrogbotRequest | PayloadRequest }
  : T;

type JobRequestParameters<T extends unknown[]> = {
  [K in keyof T]: JobRequestArgs<T[K]>;
};

type JobQueueOptions = JobRequestArgs<
  Omit<Parameters<Payload['jobs']['queue']>[0], 'input' | 'task' | 'workflow'>
> & { jobId?: string };

type JobQueueInput =
  | {
      [T in JobTaskSlug]: {
        input: TypedJobs['tasks'][T]['input'];
        task: T;
        workflow?: never;
      };
    }[JobTaskSlug]
  | {
      [T in JobWorkflowSlug]: {
        input: TypedJobs['workflows'][T]['input'];
        task?: never;
        workflow: T;
      };
    }[JobWorkflowSlug];

export type JobQueueArgs<T extends JobSlug> = JobQueueOptions &
  JobQueueInput &
  ({ task: T } | { workflow: T });

type JobTaskStatus = {
  [T in JobTaskSlug]: Record<
    string,
    {
      complete: boolean;
      input: TypedJobs['tasks'][T]['input'];
      output: TypedJobs['tasks'][T]['output'];
      taskSlug: JobTaskSlug;
      totalTried: number;
    }
  >;
};

type JobQueueResult<T extends JobSlug> = T extends JobWorkflowSlug
  ? Omit<Awaited<ReturnType<Payload['jobs']['queue']>>, 'input' | 'taskStatus'> & {
      input: TypedJobs['workflows'][T]['input'];
      taskStatus: JobTaskStatus;
    }
  : T extends JobTaskSlug
    ? Omit<Awaited<ReturnType<Payload['jobs']['queue']>>, 'input' | 'taskStatus'> & {
        input: TypedJobs['tasks'][T]['input'];
        taskStatus: JobTaskStatus;
      }
    : never;

export type Jobs = {
  [K in Exclude<keyof Payload['jobs'], 'queue'>]: (
    ...args: JobRequestParameters<Parameters<Payload['jobs'][K]>>
  ) => ReturnType<Payload['jobs'][K]>;
} & {
  queue: <T extends JobSlug>(args: JobQueueArgs<T>) => Promise<JobQueueResult<T>>;
};

declare const _nativeQueue: Payload['jobs']['queue'];

export type JobsRuntime = Omit<Payload['jobs'], 'queue'> & {
  queue: <T extends keyof PayloadTypedJobs['tasks'] | keyof PayloadTypedJobs['workflows']>(
    args: Parameters<typeof _nativeQueue<T>>[0] & { jobId?: string },
  ) => ReturnType<typeof _nativeQueue<T>>;
};
