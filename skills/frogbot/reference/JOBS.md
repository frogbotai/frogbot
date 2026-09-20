# Jobs

Docs: https://docs.frogbot.ai/jobs-queue/overview and https://docs.frogbot.ai/jobs-queue/workers

Configure tasks and workflows under `jobs` in `buildConfig`. Queue them through `frogbot.jobs`.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [],
  jobs: {
    tasks: [
      {
        slug: 'send-report',
        inputSchema: [{ name: 'reportId', type: 'text', required: true }],
        outputSchema: [{ name: 'reportId', type: 'text', required: true }],
        async handler({ input }) {
          return { output: { reportId: input.reportId } };
        },
      },
    ],
  },
});
```

```ts
await frogbot.jobs.queue({
  task: 'send-report',
  input: { reportId: 'report-123' },
  queue: 'default',
});
```

Generated FrogBot types connect task and workflow slugs to their input and output. `jobId` may be supplied when queueing to provide an application identifier.

## Leases

FrogBot claims jobs with database-backed leases so competing workers do not execute the same claim concurrently. `leaseDuration` defaults to the exported `DEFAULT_JOB_LEASE_DURATION` and must be an integer from 5 through 2,147,483,647 milliseconds.

`jobs.runHooks` must remain false and `jobs.depth` must remain zero because claims must stay atomic. FrogBot adds and owns its claim fields and a reserved sweep task. Do not define the `frogbot-sweep-jobs` task.

## Workflow waits

Workflow handlers receive `waitFor` and return no output. Use a helper to compute an approval result, then consume it inside the handler. Register `approvalWorkflow` in `jobs.workflows`:

```ts
import type { WorkflowConfig, WorkflowHandler } from 'frogbot/jobs';

async function waitForApproval(waitFor: Parameters<WorkflowHandler>[0]['waitFor']) {
  const result = await waitFor<{ approved: boolean }>('approval', {
    expiresIn: 86_400_000,
    async onWait({ resumeUrl }) {
      await fetch('https://example.com/approvals', {
        method: 'POST',
        body: JSON.stringify({ resumeUrl }),
      });
    },
  });

  if (result.expired) return { output: { approved: false } };

  return { output: { approved: result.data.approved } };
}

export const approvalWorkflow: WorkflowConfig = {
  slug: 'approval',
  async handler({ waitFor }) {
    const { output } = await waitForApproval(waitFor);

    console.log(output.approved);
  },
};
```

Use `{ until: date }` for a delay, or `onWait` with optional `expiresIn` for external resumption. Resumable waits require `serverURL` to produce `/api/jobs/:token/resume`. Resume through `frogbot.jobs.resume({ token, data })` or the generated URL.

Wait names must be non-empty, unique within one workflow run, and stable across replay. The default expiry is seven days and the maximum is thirty days; both can be changed with `jobs.waitpoints.defaultExpiresIn` and `jobs.waitpoints.maxExpiresIn`.

## Run workers

Queueing persists work; a worker must execute it. Run the CLI from the application directory with its config, imports, dependencies, database credentials, and secrets available. It initializes FrogBot, including application `onInit`, without starting Next.js:

```bash
pnpm exec frogbot jobs:run --cron "*/5 * * * * *" --limit 6 --all-queues --handle-schedules
```

This long-running process handles schedules and then executes up to six jobs every five seconds. The first tick is the next cron match in the process's local timezone; overlapping ticks are skipped. Web and worker replicas must share the database and compatible application config.

| Flag                 | Behavior                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `--cron`             | Defaults to `* * * * *` (every minute); accepts a seconds field. |
| `--limit`            | Defaults to `10`; CLI `0` runs no jobs.                          |
| `--queue`            | Selects one queue, defaulting to `default`.                      |
| `--all-queues`       | Covers every queue; cannot be combined with `--queue`.           |
| `--handle-schedules` | Enqueues scheduled work before execution; off by default.        |

Merge these options into the existing `jobs` config when dedicated workers own execution; keep its task and workflow definitions:

```ts
import type { JobsConfig } from 'frogbot/jobs';

export const workerJobs = {
  autoRun: [],
  shouldAutoRun: () => false,
} satisfies JobsConfig;
```

`shouldAutoRun` blocks web-side execution, but scheduling can happen before that guard. Agent schedules and mounted piece triggers can append autorun entries even when you set `autoRun: []`. The CLI itself disables built-in autorun before initialization and runs its own tick loop.

To separate scheduling from execution, run a scheduler with `--handle-schedules --all-queues --limit 0` and workers with `--all-queues`. Keep both scheduling and execution covering `default`: the reserved sweep task recovers expired leases, expires waits, and retries pending continuation dispatch. A scheduler alone cannot execute the sweep or resumed work. CLI `--limit 0` differs from Local API `jobs.run({ limit: 0 })`, which is unlimited.

On normal `SIGINT`/`SIGTERM` shutdown, workers stop new ticks, drain active work and heartbeat, and close the database. Allow enough shutdown time for the active batch. Forced termination relies on lease recovery; job side effects must tolerate at-least-once execution. See [job workers](https://docs.frogbot.ai/jobs-queue/workers) for deployment and exceptional batch-failure behavior.
