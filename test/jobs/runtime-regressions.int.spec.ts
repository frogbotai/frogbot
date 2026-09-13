import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createLocalReq } from 'payload';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { adapterName, bootJobsFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture();
});

afterEach(() => {
  fixture.actions.clear();
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function readJob(id: number | string) {
  const result = await fixture.payload.db.find({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
  });

  assert.equal(result.docs.length, 1);

  return result.docs[0];
}

function queueJob(marker: string) {
  return fixture.frogbot.jobs.queue({ task: 'record-effect', queue: marker, input: { marker } });
}

describe(`native jobs runtime regressions: ${adapterName}`, () => {
  it.each([false, true])(
    'preserves ordinary allowed by-ID updates from handlers (already processing=%s)',
    async (processing) => {
      const marker = randomUUID();
      const outside = await queueJob(`${marker}-outside`);
      const inside = await queueJob(`${marker}-inside`);
      const worker = await queueJob(marker);

      if (processing) {
        for (const target of [outside, inside]) {
          await fixture.payload.db.updateOne({
            collection: 'payload-jobs',
            id: target.id,
            data: { processing: true },
          });
        }
      }

      const before = await readJob(inside.id);
      const req = await createLocalReq({}, fixture.payload);
      const outsideResult = await fixture.payload.update({
        collection: 'payload-jobs',
        id: outside.id,
        data: { processing: true, priority: 42 },
        overrideAccess: false,
        req,
      });

      let insideResult: unknown;

      fixture.actions.set(marker, async (req) => {
        insideResult = await req.payload.update({
          collection: 'payload-jobs',
          id: inside.id,
          data: { processing: true, priority: 42 },
          overrideAccess: false,
          req,
        });
      });

      await fixture.frogbot.jobs.runByID({ id: worker.id });

      expect(outsideResult).toMatchObject({ id: outside.id, processing: true, priority: 42 });
      expect.soft(insideResult).toMatchObject({ id: inside.id, processing: true, priority: 42 });
      expect.soft(insideResult).not.toHaveProperty('docs');
      expect.soft(await readJob(inside.id)).toMatchObject({ processing: true, priority: 42 });
      expect.soft((await readJob(inside.id)).leaseOwner).toBe(before.leaseOwner);
      expect.soft((await readJob(inside.id)).leaseUntil).toBe(before.leaseUntil);
    },
  );

  it('leaves a denied ordinary by-ID update unchanged inside a native handler', async () => {
    const marker = randomUUID();
    const outside = await queueJob(`${marker}-outside`);
    const inside = await queueJob(`${marker}-inside`);
    const worker = await queueJob(marker);
    const before = await readJob(inside.id);
    const req = await createLocalReq(
      { req: { context: { denyJobUpdate: true } } },
      fixture.payload,
    );

    await expect(
      fixture.payload.update({
        collection: 'payload-jobs',
        id: outside.id,
        data: { processing: true, priority: 99 },
        overrideAccess: false,
        req,
      }),
    ).rejects.toMatchObject({ status: 403 });

    let rejected: unknown;

    fixture.actions.set(marker, async (req) => {
      const deniedReq = await createLocalReq(
        { req: { ...req, context: { ...req.context, denyJobUpdate: true } } },
        req.payload,
      );

      try {
        await req.payload.update({
          collection: 'payload-jobs',
          id: inside.id,
          data: { processing: true, priority: 99 },
          overrideAccess: false,
          req: deniedReq,
        });
      } catch (error) {
        rejected = error;
      }
    });

    await fixture.frogbot.jobs.runByID({ id: worker.id });

    expect.soft(rejected).toMatchObject({ status: 403 });
    expect(await readJob(inside.id)).toEqual(before);
  });
});
