import type { RunInlineTaskFunction as PayloadRunInlineTaskFunction } from 'payload';

import type { FrogBotRequest } from '../../types/request.js';

export type WaitpointResult<T = unknown> = { expired: false; data: T } | { expired: true };

export type WaitpointReplay = {
  jobId: string;
  results: Record<string, WaitpointResult | null>;
  waiting?: string;
};

export type Waitpoint = {
  id: number | string;
  jobId: string;
  name: string;
  holder?: number | string | null;
  token: string;
  kind: 'delay' | 'resumable';
  ready: boolean;
  status: 'pending' | 'resumed' | 'expired';
  expiresAt?: string;
  until?: string;
  data?: unknown;
  dispatched: boolean;
  dispatchOwner?: string | null;
  dispatchLeaseUntil?: string | null;
};

export type WaitFor = {
  (
    name: string,
    options: { until: Date | string; onWait?: never; expiresIn?: never },
  ): Promise<void>;
  <T = unknown>(
    name: string,
    options: {
      until?: never;
      expiresIn?: number;
      onWait: (args: { resumeUrl: string }) => void | Promise<void>;
    },
  ): Promise<WaitpointResult<T>>;
};

type PayloadInlineTaskArgs = Parameters<PayloadRunInlineTaskFunction>[1];

export type StepRetries = PayloadInlineTaskArgs['retries'];

/** Payload's `inlineTask`, with `req` typed as `FrogBotRequest` in the step it runs. */
export type RunInlineTaskFunction = <TTaskInput extends object, TTaskOutput extends object>(
  taskID: string,
  taskArgs: {
    input?: TTaskInput;
    retries?: StepRetries;
    task: (
      args: Omit<Parameters<PayloadInlineTaskArgs['task']>[0], 'inlineTask' | 'input' | 'req'> & {
        inlineTask: RunInlineTaskFunction;
        input: TTaskInput;
        req: FrogBotRequest;
      },
    ) => { output: TTaskOutput } | Promise<{ output: TTaskOutput }>;
  },
) => Promise<TTaskOutput>;

export type StepTaskArgs = Omit<
  Parameters<Parameters<RunInlineTaskFunction>[1]['task']>[0],
  'input'
>;

type StepResult<TOutput extends object> = { output: TOutput } | Promise<{ output: TOutput }>;

export type Foreach = <TItem, TOutput extends object>(
  name: string,
  items: readonly TItem[],
  options: {
    key: (item: TItem) => string | number;
    task: (args: StepTaskArgs & { item: TItem }) => StepResult<TOutput>;
    concurrency?: number;
    retries?: StepRetries;
  },
) => Promise<TOutput[]>;

export type Parallel = <
  TBranches extends Record<string, (args: StepTaskArgs) => StepResult<object>>,
>(
  name: string,
  branches: TBranches,
  options?: { retries?: StepRetries },
) => Promise<{ [K in keyof TBranches]: Awaited<ReturnType<TBranches[K]>>['output'] }>;

export type WaitpointOptions = {
  defaultExpiresIn: number;
  maxExpiresIn: number;
};
