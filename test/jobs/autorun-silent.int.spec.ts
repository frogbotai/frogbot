import { BasePayload } from 'payload';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { FROGBOT_AUTORUN } from '../../packages/frogbot/src/jobs/autoRun.js';
import { bootJobsFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let runner: BasePayload | undefined;

beforeAll(async () => {
  fixture = await bootJobsFixture();
});

afterAll(async () => {
  await runner?.destroy();
  await fixture?.shutdown();
});

it("FrogBot's runner logs a failing job but not 'Running N jobs.'", async () => {
  const lines: { level: number; msg?: string; err?: { message?: string } }[] = [];
  const config = fixture.payload.config;

  await fixture.payload.jobs.queue({
    task: 'record-effect',
    input: { marker: 'quiet' },
    overrideAccess: true,
  });

  await fixture.payload.jobs.queue({ task: 'fail-for-good', input: {}, overrideAccess: true });

  runner = new BasePayload();

  await runner.init({
    config: {
      ...config,
      logger: {
        options: { enabled: true, level: 'info' },
        destination: { write: (line: string) => lines.push(JSON.parse(line)) },
      },
      jobs: { ...config.jobs, autoRun: [{ ...FROGBOT_AUTORUN, cron: '* * * * * *' }] },
    },
    disableOnInit: true,
    cron: true,
  });

  await vi.waitFor(
    async () => {
      const { docs } = await fixture.payload.find({
        collection: 'effects',
        where: { marker: { equals: 'quiet' } },
        overrideAccess: true,
      });

      expect(docs).toHaveLength(1);
      expect(
        lines.some(
          ({ level, err }) => level === 50 && err?.message === 'FrogBot terminal failure fixture',
        ),
      ).toBe(true);
    },
    { timeout: 10_000, interval: 200 },
  );

  expect(lines.filter(({ msg }) => msg?.startsWith('Running '))).toEqual([]);
});
