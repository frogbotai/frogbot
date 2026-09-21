import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

const databasePath = process.env.JOBS_CLI_DATABASE;
const scenario = process.env.JOBS_CLI_SCENARIO;

if (!databasePath) throw new Error('JOBS_CLI_DATABASE is required');

function report(type, data = {}) {
  process.send?.({ type, ...data });
}

function waitForCommand(type) {
  return new Promise((resolve) => {
    const listener = (message) => {
      if (message?.type !== type) return;

      process.off('message', listener);
      resolve();
    };

    process.on('message', listener);
  });
}

const releaseHandler = waitForCommand('release-handler');

process.on('SIGTERM', () => report('sigterm-observed'));
process.on('SIGINT', () => report('sigint-observed'));
process.on('message', (message) => {
  if (message?.type === 'ping') report('pong');
});

process.channel?.unref();

const config = await buildConfig({
  secret: 'frogbot-jobs-cli-isolated-test-secret',
  db: sqliteAdapter({
    client: { url: `file:${databasePath}` },
    push: true,
    busyTimeout: 5000,
    wal: true,
  }),
  typescript: { autoGenerate: false },
  collections: [
    {
      slug: 'executions',
      fields: [
        { name: 'job', type: 'text', required: true },
        { name: 'runtimeReady', type: 'checkbox', required: true },
      ],
    },
  ],
  jobs: {
    deleteJobOnComplete: false,
    autoRun: [{ cron: '* * * * * *', allQueues: true }],
    shouldAutoRun: () => {
      report('autorun-called');

      return true;
    },
    tasks: [
      {
        slug: 'cli-work',
        handler: async ({ job, req }) => {
          const runtimeReady = Boolean(req.frogbot?.jobs && req.frogbot?.collections.executions);

          if (!runtimeReady) throw new Error('FrogBot task request has no initialized runtime');

          await req.frogbot.create({
            collection: 'executions',
            data: { job: String(job.id), runtimeReady },
            req,
          });

          report('handler-started', { id: job.id, runtimeReady });

          if (scenario === 'drain') await releaseHandler;

          return { output: {} };
        },
      },
      {
        slug: 'cli-scheduled',
        schedule: [
          {
            cron: '* * * * * *',
            queue: 'scheduled',
            hooks: {
              afterSchedule: async (args) => {
                await args.defaultAfterSchedule(args);
                report('schedule-observed', { status: args.status, id: args.job?.id });
              },
            },
          },
        ],
        handler: async () => {
          report('scheduled-handler-started');

          return { output: {} };
        },
      },
    ],
  },
  onInit: async (frogbot) => {
    const req = await frogbot.createRequest();
    const count = scenario === 'drain' ? 2 : 3;
    const ids = [];

    for (let index = 0; index < count; index++) {
      const job = await frogbot.jobs.queue({
        task: 'cli-work',
        queue: 'work',
        input: {},
        jobId: `cli-work-${index}`,
        req,
      });

      ids.push(job.id);
    }

    const other = await frogbot.jobs.queue({
      task: 'cli-work',
      queue: 'other',
      input: {},
      req,
    });

    report('booted', {
      ids,
      other: other.id,
      runtimeReady: req.frogbot === frogbot,
      configuredAutorun,
      activeAutorun: req.payload.config.jobs.autoRun.length,
    });
  },
});

const configuredAutorun = (await config._internal.payloadConfig).jobs.autoRun.length;

export default config;
