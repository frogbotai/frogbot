import type { Job, PayloadRequest } from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
              handler: async () => {
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

      try {
        await started.promise;
        await vi.advanceTimersByTimeAsync(1000);

        expect(settled).toBe(false);
        expect(rows[0].processing).toBe(true);
        expect(operations.update).toHaveBeenCalled();
      } finally {
        allowed.resolve();

        await run;
      }

      expect(payload.config.jobs).toMatchObject({ runHooks: false, depth: 0 });
      expect(events).toEqual([`${succeeds ? 'success' : 'failure'}:1`]);
      expect(rows[0].processing).toBe(false);
      expect(rows[0].log).toEqual([
        expect.objectContaining({ taskSlug: 'work', state: succeeds ? 'succeeded' : 'failed' }),
      ]);

      if (succeeds) {
        expect(rows[0].completedAt).toEqual(expect.any(String));
        expect(rows[0].log?.[0].output).toEqual({ finished: true });
      } else {
        expect(rows[0].hasError).toBe(true);
        expect(rows[0].error).toMatchObject({ message: 'task failed' });
      }

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

      if (mode === 'same-job') rows[2].processing = true;

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
                try {
                  insideResult = await jobReq.payload.update({
                    collection: 'payload-jobs',
                    id: target,
                    data: { processing: true, queue: 'changed' },
                    overrideAccess: false,
                    disableTransaction: true,
                    req: jobReq,
                  });
                } catch (error) {
                  insideError = error;
                }

                return { output: {} };
              },
            },
          ],
        },
      });

      let outsideResult: unknown;
      let outsideError: unknown;

      try {
        outsideResult = await payload.update({
          collection: 'payload-jobs',
          id: 3,
          data: { processing: true, queue: 'changed' },
          overrideAccess: false,
          disableTransaction: true,
          req,
        });
      } catch (error) {
        outsideError = error;
      }

      if (allowed) {
        expect(outsideError).toBeUndefined();
        expect(outsideResult).toMatchObject({ id: 3, processing: true, queue: 'changed' });
      } else {
        expect(outsideError).toMatchObject({ status: 403 });
        expect(rows[2]).toMatchObject({ processing: false, queue: 'default' });
      }

      await payload.jobs.run({ req, limit: 1, silent: true });

      if (allowed) {
        expect(insideError).toBeUndefined();
        expect(insideResult).toMatchObject({ id: target, processing: true, queue: 'changed' });
        expect(rows[target - 1].queue).toBe('changed');
      } else {
        expect(insideError).toMatchObject({ status: 403 });
        expect(rows[1]).toMatchObject({ processing: false, queue: 'default' });
        expect((rows[1] as Job & { leaseOwner?: string }).leaseOwner).toBeUndefined();
      }
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
          try {
            results.push(
              await req.payload.update({
                collection: 'payload-jobs',
                id,
                data: { processing: true, queue: 'ordinary' },
                req: { ...req, transactionID: 'application-transaction' },
                overrideAccess: false,
              }),
            );
          } catch (error) {
            errors.push(error);
          }
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
          tasks: [{ slug: 'work', handler: async () => ({ output: {} }) }],
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
