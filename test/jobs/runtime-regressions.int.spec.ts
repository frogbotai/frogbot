import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createPayloadRequest } from 'payload';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { adapterName, bootJobsFixture, type FrogBotJob } from './fixture.js';

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
  const result = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
  });

  assert.equal(result.docs.length, 1);

  return result.docs[0];
}

function queueJob(marker: string) {
  return fixture.frogbot.jobs.queue({
    task: 'record-effect',
    queue: marker,
    input: { marker },
    overrideAccess: true,
  });
}

describe(`native jobs runtime regressions: ${adapterName}`, () => {
  it.each([{ updated: false, preProcessed: [] }, { preProcessed: ['outside', 'inside'] }] as const)(
    'preserves ordinary allowed by-ID updates from handlers (already updated=$updated)',
    async ({ preProcessed }) => {
      const marker = randomUUID();
      const outside = await queueJob(`${marker}-outside`);
      const inside = await queueJob(`${marker}-inside`);
      const worker = await queueJob(marker);

      const queued = { outside, inside };

      for (const name of preProcessed) {
        await fixture.payload.db.updateOne({
          collection: 'payload-jobs',
          id: queued[name].id,
          data: { priority: 7 },
        });
      }

      const before = await readJob(inside.id);
      const req = await createPayloadRequest({ payload: fixture.payload });
      const outsideResult = await fixture.payload.update({
        collection: 'payload-jobs',
        id: outside.id,
        data: { priority: 42 },
        overrideAccess: false,
        req,
      });

      let insideResult: unknown;

      fixture.actions.set(marker, async (req) => {
        insideResult = await req.payload.update({
          collection: 'payload-jobs',
          id: inside.id,
          data: { priority: 42 },
          overrideAccess: false,
          req,
        });
      });

      await fixture.frogbot.jobs.runByID({ id: worker.id, overrideAccess: true });

      expect(outsideResult).toMatchObject({ id: outside.id, priority: 42 });
      expect.soft(insideResult).toMatchObject({ id: inside.id, priority: 42 });
      expect.soft(insideResult).not.toHaveProperty('docs');
      expect.soft(await readJob(inside.id)).toMatchObject({ priority: 42 });
      expect.soft((await readJob(inside.id)).processingToken).toBe(before.processingToken);
      expect.soft((await readJob(inside.id)).processingUntil).toBe(before.processingUntil);
    },
  );

  it('leaves a denied ordinary by-ID update unchanged inside a native handler', async () => {
    const marker = randomUUID();
    const outside = await queueJob(`${marker}-outside`);
    const inside = await queueJob(`${marker}-inside`);
    const worker = await queueJob(marker);
    const before = await readJob(inside.id);
    const req = await createPayloadRequest({
      payload: fixture.payload,
      req: { context: { denyJobUpdate: true } },
    });

    await expect(
      fixture.payload.update({
        collection: 'payload-jobs',
        id: outside.id,
        data: { priority: 99 },
        overrideAccess: false,
        req,
      }),
    ).rejects.toMatchObject({ status: 403 });

    let rejected: unknown;

    fixture.actions.set(marker, async (req) => {
      const deniedReq = await createPayloadRequest({
        payload: req.payload,
        req: { ...req, context: { ...req.context, denyJobUpdate: true } },
      });

      rejected = await req.payload
        .update({
          collection: 'payload-jobs',
          id: inside.id,
          data: { priority: 99 },
          overrideAccess: false,
          req: deniedReq,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
    });

    await fixture.frogbot.jobs.runByID({ id: worker.id, overrideAccess: true });

    expect.soft(rejected).toMatchObject({ status: 403 });
    expect(await readJob(inside.id)).toEqual(before);
  });
});
