import type { DatabaseAdapter, PayloadRequest } from 'payload';

export const jobInsertOperations: unique symbol = Symbol.for('frogbot.jobs.insertOperations');

export type JobInsertOperations = {
  insert<T>(args: { req?: PayloadRequest; insert: () => Promise<T> }): Promise<T>;
};

export type JobInsertDatabase = DatabaseAdapter & {
  [jobInsertOperations]?: JobInsertOperations;
};
