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
  overrideAccess: true,
  input: { reportId: 'report-123' },
  queue: 'default',
});
```

Generated FrogBot types connect task and workflow slugs to their input and output. An optional `jobId` dedupes unfinished work across all tasks, workflows, and queues, including workflows paused at `waitFor`: a duplicate `queue` call resolves with the existing job and ignores its own arguments. The one exception is MongoDB, where two uncommitted transactions that enqueue the same new ID at once abort the losing transaction with a retryable error. Completion, failure for good, cancellation, or deletion frees the ID, so it is not an "only ever once" key and does not give exactly-once execution.

## Leases

Each run claims jobs with a fresh `processingToken` and a `processingUntil` lease and renews it while the jobs run, so competing workers never execute the same job at once. A job whose lease has passed can be claimed by any worker. `jobs.processingLease.duration` defaults to 20 minutes and `jobs.processingLease.safetyBuffer`, the cutoff before expiry after which a worker stops writing, to 30 seconds.

Recovery is at least once: make external side effects idempotent.

## Workflow waits

Workflow handlers receive `job`, `inlineTask` and `waitFor`, and return no output. Wrap each side effect in a named `inlineTask`, so a resumed run returns its saved output instead of running it again. This whole file is a workflow that waits for approval:

```ts
// src/jobs/approvalWorkflow.ts
import type { WorkflowConfig } from 'frogbot/jobs';

export const approvalWorkflow: WorkflowConfig<{ requestId: string }> = {
  slug: 'approval',
  inputSchema: [{ name: 'requestId', type: 'text', required: true }],
  async handler({ job, inlineTask, waitFor }) {
    const { requestId } = job.input;

    await inlineTask('prepare-request', {
      task: () => ({ output: { requestId, preparedAt: new Date().toISOString() } }),
    });

    const result = await waitFor<{ approved: boolean }>('approval', {
      expiresIn: 24 * 60 * 60 * 1000,
      onWait({ resumeUrl }) {
        // Send this link to the approver instead, by email or chat.
        console.log(`[approval] ${requestId} waits for approval: ${resumeUrl}`);
      },
    });

    if (result.expired) {
      await inlineTask('record-expired', {
        task: () => ({ output: { requestId, approved: false } }),
      });

      return;
    }

    await inlineTask('record-approval', {
      task: () => ({ output: { requestId, approved: result.data.approved } }),
    });
  },
};
```

Register it in `frogbot.config.ts`. A resumable wait needs `serverURL` to build its resume URL:

```ts
import { approvalWorkflow } from './jobs/approvalWorkflow';

const config: FrogBotConfig = {
  // ...the rest of your config
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  jobs: { workflows: [approvalWorkflow] },
};
```

To run a workflow once, queue it and run that job from a script. Nobody is signed in there, so both calls pass `overrideAccess: true`:

```ts
// scripts/runApprovalOnce.ts
import { getFrogBot } from 'frogbot';

import config from '../src/frogbot.config';

const frogbot = await getFrogBot({ config });

const job = await frogbot.jobs.queue({
  workflow: 'approval',
  input: { requestId: 'test' },
  overrideAccess: true,
});

await frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

console.log(`[approval] ran job ${job.id}`);
```

```bash
pnpm exec frogbot run scripts/runApprovalOnce.ts
```

`frogbot run` runs the file, closes FrogBot and exits. `runByID` returns when the job finishes or pauses; this one logs its resume URL and pauses at `waitFor`, with `waitUntil` set to the expiry and no `completedAt`. To loop over items or run steps at once, use `foreach` and `parallel` ([loops and parallel steps](https://docs.frogbot.ai/jobs-queue/overview#loops-and-parallel-steps)).

Use `{ until: date }` for a delay, or `onWait` with optional `expiresIn` for external resumption. Resumable waits require `serverURL` to produce `/api/jobs/:token/resume`. Resume through `frogbot.jobs.resume({ token, data })` or the generated URL.

A wait pauses the same job with `waitUntil` set to `until` or the expiry; resume or expiry continues it in its original queue without a continuation job. Successful local resume returns `{ jobId }`, the original record's ID; HTTP success remains `{ "ok": true }`. Cancel, supersede, or deletion ends a paused wait and its resume link then returns `409`. `runByID` runs it early and pauses again if unresolved; the default schedule check counts a paused workflow and skips overlapping runs.

Wait names must be non-empty, unique within one workflow run, and stable across replay. The default expiry is seven days and the maximum is thirty days; both can be changed with `jobs.waitpoints.defaultExpiresIn` and `jobs.waitpoints.maxExpiresIn`. `until`, computed expiry, and now plus `maxExpiresIn` must not pass `9999-12-31T23:59:59.999Z`.

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

To separate scheduling from execution, run a scheduler with `--handle-schedules --all-queues --limit 0` and workers with `--all-queues`. Keep both scheduling and execution covering `default`: the reserved sweep task recovers expired leases, expires waits, and retries pending wakes. A scheduler alone cannot execute the sweep or resumed work. CLI `--limit 0` differs from Local API `jobs.run({ limit: 0 })`, which is unlimited.

On normal `SIGINT`/`SIGTERM` shutdown, workers stop new ticks, drain active work and heartbeat, and close the database. Allow enough shutdown time for the active batch. Forced termination relies on lease recovery; job side effects must tolerate at-least-once execution. See [job workers](https://docs.frogbot.ai/jobs-queue/workers) for deployment and exceptional batch-failure behavior.
