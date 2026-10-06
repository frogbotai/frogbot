import type { Job, PayloadRequest } from 'payload';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { deferred, jobRow, nativeRunner } from './nativeRunner.js';

afterEach(() => vi.useRealTimers());

describe('native job lifecycle', () => {
  it.each(['onSuccess', 'onFail'] as const)(
    'awaits native task %s and persists its result with safe execution defaults',
    async (callback) => {
      vi.useFakeTimers();

      const started = deferred();
      const allowed = deferred();
      const rows = [jobRow(1)];
      const events: string[] = [];
      const succeeds = callback === 'onSuccess';

      const { payload, req, operations } = await nativeRunner({
        rows,
        jobs: {
          leaseDuration: 5000,
          tasks: [
            {
              slug: 'work',
              handler: () => {
                if (!succeeds) throw new Error('task failed');

                return { output: { finished: true } };
              },
              onSuccess: async ({ job }) => {
                events.push(`success:${job.id}`);
                started.resolve();

                await allowed.promise;
              },
              onFail: async ({ job }) => {
                events.push(`failure:${job.id}`);
                started.resolve();

                await allowed.promise;
              },
            },
          ],
        },
      });

      let settled = false;

      const run = payload.jobs.runByID({ id: 1, req, silent: true }).finally(() => {
        settled = true;
      });

      onTestFinished(() => allowed.resolve());

      await started.promise;
      await vi.advanceTimersByTimeAsync(1000);

      expect(settled).toBe(false);
      expect(rows[0].processing).toBe(true);
      expect(operations.update).toHaveBeenCalled();

      allowed.resolve();

      await run;

      expect(payload.config.jobs).toMatchObject({ runHooks: false, depth: 0 });
      expect(events).toEqual([`${succeeds ? 'success' : 'failure'}:1`]);
      expect(rows[0].processing).toBe(false);
      expect(rows[0].log).toEqual([
        expect.objectContaining({ taskSlug: 'work', state: succeeds ? 'succeeded' : 'failed' }),
      ]);

      expect(rows[0]).toMatchObject(
        succeeds
          ? {
              completedAt: expect.any(String),
              log: [expect.objectContaining({ output: { finished: true } })],
            }
          : { hasError: true, error: { message: 'task failed' } },
      );

      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['denied', 'allowed', 'same-job'])(
    'preserves ordinary %s by-ID updates inside a native task',
    async (mode) => {
      const rows = [jobRow(1), jobRow(2), jobRow(3)];
      const target = mode === 'same-job' ? 1 : 2;
      const allowed = mode !== 'denied';
      let insideResult: unknown;
      let insideError: unknown;

      rows[2].processing = mode === 'same-job';

      const { payload, req } = await nativeRunner({
        rows,
        jobs: {
          jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
            ...defaultJobsCollection,
            access: { ...defaultJobsCollection.access, update: () => allowed },
          }),
          tasks: [
            {
              slug: 'work',
              handler: async ({ req: jobReq }) => {
                await jobReq.payload
                  .update({
                    collection: 'payload-jobs',
                    id: target,
                    data: { processing: true, queue: 'changed' },
                    overrideAccess: false,
                    disableTransaction: true,
                    req: jobReq,
                  })
                  .then(
                    (result) => {
                      insideResult = result;
                    },
                    (error: unknown) => {
                      insideError = error;
                    },
                  );

                return { output: {} };
              },
            },
          ],
        },
      });

      let outsideResult: unknown;
      let outsideError: unknown;

      await payload
        .update({
          collection: 'payload-jobs',
          id: 3,
          data: { processing: true, queue: 'changed' },
          overrideAccess: false,
          disableTransaction: true,
          req,
        })
        .then(
          (result) => {
            outsideResult = result;
          },
          (error: unknown) => {
            outsideError = error;
          },
        );

      expect({ outsideResult, outsideError }).toEqual(
        allowed
          ? {
              outsideResult: expect.objectContaining({
                id: 3,
                processing: true,
                queue: 'changed',
              }),
              outsideError: undefined,
            }
          : { outsideResult: undefined, outsideError: expect.objectContaining({ status: 403 }) },
      );
      expect(rows[2]).toMatchObject(
        allowed ? { processing: true, queue: 'changed' } : { processing: false, queue: 'default' },
      );

      await payload.jobs.run({ req, limit: 1, silent: true });

      expect({ insideResult, insideError }).toEqual(
        allowed
          ? {
              insideResult: expect.objectContaining({
                id: target,
                processing: true,
                queue: 'changed',
              }),
              insideError: undefined,
            }
          : { insideResult: undefined, insideError: expect.objectContaining({ status: 403 }) },
      );
      expect(rows[target - 1]).toMatchObject(
        allowed ? { queue: 'changed' } : { processing: false, queue: 'default' },
      );
      expect((rows[1] as Job & { leaseOwner?: string }).leaseOwner).toBeUndefined();
    },
  );

  it.each(['access', 'ordering'])(
    'preserves ordinary updates and collection hooks from the native %s callback',
    async (phase) => {
      const rows = [jobRow(1), jobRow(2), jobRow(3)];
      const results: unknown[] = [];
      const errors: unknown[] = [];
      const ordinaryTransactions: unknown[] = [];
      const hookIDs: (number | string)[] = [];

      const update = async (req: PayloadRequest) => {
        for (const id of [2, 3]) {
          await req.payload
            .update({
              collection: 'payload-jobs',
              id,
              data: { processing: true, queue: 'ordinary' },
              req: { ...req, transactionID: 'application-transaction' },
              overrideAccess: false,
            })
            .then(
              (result) => results.push(result),
              (error: unknown) => errors.push(error),
            );
        }
      };

      const { payload, req, database } = await nativeRunner({
        rows,
        jobs: {
          access: {
            run: async ({ req }) => {
              if (phase === 'access') await update(req);

              return true;
            },
          },
          processingOrder: async ({ req }) => {
            if (phase === 'ordering') await update(req);

            return 'createdAt';
          },
          tasks: [{ slug: 'work', handler: () => ({ output: {} }) }],
          jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
            ...defaultJobsCollection,
            access: { ...defaultJobsCollection.access, update: ({ id }) => id !== 3 },
            hooks: {
              ...defaultJobsCollection.hooks,
              beforeChange: [
                ({ originalDoc, data }) => {
                  hookIDs.push(originalDoc.id);

                  return data;
                },
              ],
            },
          }),
        },
      });

      const nativeUpdateOne = database.updateOne;

      database.updateOne = async (args) => {
        if (args.id === 2) ordinaryTransactions.push(args.req?.transactionID);

        return nativeUpdateOne(args);
      };

      await payload.jobs.run({ req, limit: 1, overrideAccess: false, silent: true });

      expect(results).toEqual([
        expect.objectContaining({ id: 2, processing: true, queue: 'ordinary' }),
      ]);
      expect(errors).toEqual([expect.objectContaining({ status: 403 })]);
      expect(ordinaryTransactions).toEqual(['application-transaction']);
      expect(hookIDs).toEqual([2]);
      expect(rows[2]).toMatchObject({ processing: false, queue: 'default' });
      expect(rows[2]).not.toHaveProperty('leaseOwner');
      expect(rows[0].completedAt).toEqual(expect.any(String));
    },
  );
});
