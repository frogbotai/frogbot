import { definePlugin, FROGBOT_QUEUE } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';
import { BasePayload } from 'payload';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { frogbotAutoRun } from '../../packages/frogbot/src/jobs/autoRun.js';
import { bootJobsFixture } from './fixture.js';

type LogLine = { level: number; msg?: string; err?: { message?: string } };

const tickPlugin = definePlugin({
  slug: 'tick',
  plugin: ({ config }) => ({
    ...config,
    jobs: {
      ...config.jobs,
      tasks: [
        ...(config.jobs?.tasks ?? []),
        {
          slug: 'plugin-tick',
          schedule: [{ cron: '* * * * * *', queue: FROGBOT_QUEUE }],
          handler: async ({ job, req }) => {
            await toPayloadRequest(req).payload.create({
              collection: 'effects',
              data: { jobRecord: String(job.id), marker: 'plugin-tick', owner: 'plugin' },
              overrideAccess: true,
            });

            return { output: {} };
          },
        },
      ],
    },
  }),
});

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let runner: BasePayload | undefined;

beforeAll(async () => {
  fixture = await bootJobsFixture({ config: { plugins: [tickPlugin()] } });
});

afterEach(async () => {
  await runner?.destroy();
  runner = undefined;
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function startRunner(lines: LogLine[] = []) {
  const config = fixture.payload.config;
  const autoRun = Array.isArray(fixture.autoRun) ? fixture.autoRun : [];

  runner = new BasePayload();

  await runner.init({
    config: {
      ...config,
      logger: {
        options: { enabled: true, level: 'info' },
        destination: { write: (line: string) => lines.push(JSON.parse(line)) },
      },
      jobs: {
        ...config.jobs,
        autoRun: autoRun.map((entry) => ({ ...entry, cron: '* * * * * *' })),
      },
    },
    disableOnInit: true,
    cron: true,
  });
}

async function effects(marker: string) {
  const { docs } = await fixture.payload.find({
    collection: 'effects',
    where: { marker: { equals: marker } },
    overrideAccess: true,
  });

  return docs;
}

it("adds FrogBot's runner for a plugin's scheduled task, scoped to the frogbot queue", () => {
  expect(fixture.autoRun).toEqual([frogbotAutoRun(FROGBOT_QUEUE)]);
});

it("runs a plugin's scheduled task and leaves the app's default queue alone", async () => {
  const appJob = await fixture.payload.jobs.queue({
    task: 'record-effect',
    input: { marker: 'app-default' },
    overrideAccess: true,
  });

  await startRunner();

  await vi.waitFor(async () => expect(await effects('plugin-tick')).not.toHaveLength(0), {
    timeout: 10_000,
    interval: 200,
  });

  expect(await effects('app-default')).toEqual([]);
  await expect(
    fixture.payload.findByID({ collection: 'payload-jobs', id: appJob.id, overrideAccess: true }),
  ).resolves.toMatchObject({ queue: 'default', completedAt: null, totalTried: 0 });
});

it("FrogBot's runner logs a failing job but not 'Running N jobs.'", async () => {
  const lines: LogLine[] = [];

  await fixture.payload.jobs.queue({
    task: 'record-effect',
    queue: FROGBOT_QUEUE,
    input: { marker: 'quiet' },
    overrideAccess: true,
  });

  await fixture.payload.jobs.queue({
    task: 'fail-for-good',
    queue: FROGBOT_QUEUE,
    input: {},
    overrideAccess: true,
  });

  await startRunner(lines);

  await vi.waitFor(
    async () => {
      expect(await effects('quiet')).toHaveLength(1);
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
