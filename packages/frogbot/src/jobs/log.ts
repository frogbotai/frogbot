import type { DatabaseAdapter, PayloadRequest } from 'payload';

export const jobLogOperations: unique symbol = Symbol.for('frogbot.jobs.logOperations');

export type JobLogOperations = {
  prune(args: { id: number | string; keep: string[]; req: PayloadRequest }): Promise<void>;
};

export type JobLogDatabase = DatabaseAdapter & {
  [jobLogOperations]?: JobLogOperations;
};
