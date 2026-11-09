# Automations

Docs: https://docs.frogbot.ai/hooks/collections and https://docs.frogbot.ai/jobs-queue/overview

An automation is a rule such as "when a ticket has been Pending for 48 hours, solve it and email the customer". In FrogBot it is code: a hook or schedule queues a job, and the job waits and acts. There is no visual builder and no automation helper. People see and steer automations through ordinary records and the app's own views.

| Rule                         | Build it with                                                                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When a record changes        | `afterChange`, comparing `doc` with `previousDoc`, then `req.frogbot.jobs.queue`                                                                                                                                                                                             |
| On a schedule                | a task's `schedule` cron ([JOBS.md](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md)), or an agent's `schedule` trigger ([AGENTS.md](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/AGENTS.md)) |
| Wait a fixed time            | a workflow's `waitFor(name, { until })`                                                                                                                                                                                                                                      |
| Wait for a person, give up   | `waitFor(name, { onWait, expiresIn })`, as in the approval workflow in [JOBS.md](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md#workflow-waits)                                                                                   |
| Act somewhere else           | a piece action, `req.frogbot.email.sendEmail`, `fetch`, or `frogbot.agents.<slug>.generate`                                                                                                                                                                                  |
| Don't trigger yourself again | a `context` flag on the nested write                                                                                                                                                                                                                                         |

## A complete rule

A Helpdesk app solves tickets left in Pending for 48 hours. The hook only stamps and queues; the workflow does the work. This whole file is the collection:

```ts
// src/collections/Tickets.ts
import type { CollectionConfig } from 'frogbot';

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  fields: [
    { name: 'subject', type: 'text', required: true },
    { name: 'customerEmail', type: 'email', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['open', 'pending', 'solved'],
      defaultValue: 'open',
      required: true,
    },
    { name: 'pendingSince', type: 'date', admin: { readOnly: true } },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        const entering =
          data.status === 'pending' &&
          (operation === 'create' || originalDoc?.status !== 'pending');

        data.pendingSince = entering ? new Date().toISOString() : originalDoc?.pendingSince;

        return data;
      },
    ],
    afterChange: [
      async ({ context, doc, previousDoc, req }) => {
        if (context.automation) return doc;
        if (doc.status !== 'pending' || previousDoc?.status === 'pending') return doc;

        const pendingSince = String(doc.pendingSince);

        await req.frogbot.jobs.queue({
          workflow: 'auto-solve',
          input: { ticketId: String(doc.id), pendingSince },
          jobId: `auto-solve:${doc.id}:${pendingSince}`,
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
```

`pendingSince` marks each stint in Pending (a new or duplicated ticket starts its own, and other saves keep the stored value), and the `jobId` names that stint, so a save that keeps the ticket pending queues nothing new and a ticket that goes pending, open, pending gets a fresh 48 hours. The old job still wakes, sees a different `pendingSince` and does nothing. Queueing with `req` puts the job in the save's transaction, so if the save fails no job exists. That needs a database that runs transactions: Postgres, MongoDB on a replica set, or SQLite with `transactionOptions: {}`, as the [config below](#see-what-ran) sets. SQLite's default runs without them, and a failed save can leave its job behind.

This whole file is the workflow:

```ts
// src/jobs/autoSolve.ts
import { createSlack } from '@frogbotai/piece-slack';
import type { WorkflowConfig } from 'frogbot/jobs';

const slack = createSlack({ auth: { botToken: process.env.SLACK_BOT_TOKEN! } });

const WAIT = 48 * 60 * 60 * 1000;

export const autoSolve: WorkflowConfig<{ ticketId: string; pendingSince: string }> = {
  slug: 'auto-solve',
  inputSchema: [
    { name: 'ticketId', type: 'text', required: true },
    { name: 'pendingSince', type: 'text', required: true },
  ],
  retries: 3,
  async handler({ job, inlineTask, waitFor, req }) {
    const { ticketId, pendingSince } = job.input;

    await waitFor('pending-48h', { until: new Date(Date.parse(pendingSince) + WAIT) });

    const ticket = await inlineTask('check', {
      task: async () => {
        const doc = await req.frogbot.findByID({
          collection: 'tickets',
          id: ticketId,
          overrideAccess: true,
          req,
        });

        return {
          output: {
            stillPending: doc.status === 'pending' && doc.pendingSince === pendingSince,
            customerEmail: String(doc.customerEmail),
            subject: String(doc.subject),
          },
        };
      },
    });

    if (!ticket.stillPending) return;

    await inlineTask('solve', {
      task: async () => {
        await req.frogbot.update({
          collection: 'tickets',
          id: ticketId,
          data: { status: 'solved' },
          context: { automation: true },
          overrideAccess: true,
          req,
        });

        return { output: {} };
      },
    });

    await inlineTask('email-customer', {
      task: async () => {
        await req.frogbot.email.sendEmail({
          to: ticket.customerEmail,
          subject: `Solved: ${ticket.subject}`,
          text: 'We marked your ticket solved after 48 hours without a reply. Reply to reopen it.',
        });

        return { output: {} };
      },
    });

    await inlineTask('post-to-slack', {
      task: async () => {
        await slack.sendChannelMessage({
          input: { channel: '#support', text: `Auto-solved ticket ${ticketId}: ${ticket.subject}` },
          overrideAccess: true,
          req,
        });

        return { output: {} };
      },
    });
  },
};
```

- The wait is measured from `pendingSince`, which is in the input, so it stays the same when the paused job resumes.
- Don't cancel jobs from inside a hook: `jobs.cancel` opens its own transaction, and on SQLite it waits on the save's write lock until the save fails. Let a stale job wake and find nothing to do, as here.
- `check` decides once. Its output is saved, so a retry after a failed email skips straight to the email instead of reading the ticket again and finding it already solved.
- Each side effect is its own `inlineTask`, so a retry repeats only the step that failed.
- `slack` uses static credentials (`createSlack({ auth })`): a job has no signed-in user whose connection it could use.

Register both and run a worker, as the [config below](#see-what-ran) shows.

## Traps

### Don't block the save

`afterChange` runs before the response returns, and inside the save's transaction when the database runs one. Queue a job and return. Never send email, call an API, run an agent or wait inside the hook: the person saving waits, a slow provider times out the save, and a failure rolls back their edit. One `jobs.queue` call is a single insert and is fine to await.

### Loops

A job that writes the same collection runs its hooks again. A rule that reacts to every change of a ticket would queue itself again on its own write. Pass a flag in `context` on the nested write and return early on it, as `Tickets` does with `context.automation`. Prefer comparing `doc` with `previousDoc` over reacting to every save, so a rule fires on a change, not on each write.

### Retries repeat side effects

Jobs run at least once. A retry, or a crash after an email went out but before its step was saved, runs that step again.

- Give the queue call a `jobId` that names the work, so duplicates while it is unfinished are absorbed. A finished job frees its ID: `jobId` is not "only ever once".
- Wrap each side effect in its own named `inlineTask`; a resumed or retried run returns the saved output instead of running it again.
- Read state inside an `inlineTask` when later steps depend on it, so a retry doesn't change its mind.
- When a duplicate is unacceptable, pass the destination's idempotency key (the webhook below sends one), or record what was sent and check before sending.

### Run as the right user

A job has no `req.user`. Local API calls enforce access by default, so a call without `overrideAccess` runs as an anonymous user and is usually denied. Pass `overrideAccess: true` for the automation's own system work, as the examples do. When the job must act with a person's permissions, put their ID in the job's input, load the user, and pass `user` with `overrideAccess: false` ([QUERIES.md](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/QUERIES.md#access-control)). Piece actions likewise need static credentials, or a `req` for that user, since there is no session connection to fall back on.

## Steering: pause and stop

When people need to act on a running rule, make the rule's state a record they edit and have the workflow read it before each step. An email sequence keeps one `enrollments` record per contact; setting it to Paused skips sends, Stopped ends the sequence. Its admin list is the view people use, with no extra UI:

```ts
// src/collections/Enrollments.ts
import type { CollectionConfig } from 'frogbot';

export const Enrollments: CollectionConfig = {
  slug: 'enrollments',
  admin: { useAsTitle: 'email' },
  access: { read: ({ req }) => Boolean(req.user), update: ({ req }) => Boolean(req.user) },
  fields: [
    { name: 'email', type: 'email', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['active', 'paused', 'stopped', 'finished'],
      defaultValue: 'active',
      required: true,
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc;

        await req.frogbot.jobs.queue({
          workflow: 'follow-up',
          input: { enrollmentId: String(doc.id) },
          jobId: `follow-up:${doc.id}`,
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
```

```ts
// src/jobs/followUp.ts
import type { WorkflowConfig } from 'frogbot/jobs';

const DAY = 24 * 60 * 60 * 1000;

const steps = [
  { day: 0, subject: 'Welcome aboard' },
  { day: 3, subject: 'Getting started' },
  { day: 7, subject: 'How is it going?' },
];

export const followUp: WorkflowConfig<{ enrollmentId: string }> = {
  slug: 'follow-up',
  inputSchema: [{ name: 'enrollmentId', type: 'text', required: true }],
  retries: 3,
  async handler({ job, inlineTask, waitFor, req }) {
    const { enrollmentId } = job.input;

    for (const [index, step] of steps.entries()) {
      if (step.day > 0) {
        await waitFor(`wait-${index}`, {
          until: new Date(Date.parse(job.createdAt) + step.day * DAY),
        });
      }

      const enrollment = await inlineTask(`check-${index}`, {
        task: async () => {
          const doc = await req.frogbot.findByID({
            collection: 'enrollments',
            id: enrollmentId,
            overrideAccess: true,
            req,
          });

          return { output: { status: String(doc.status), email: String(doc.email) } };
        },
      });

      if (enrollment.status === 'stopped') return;
      if (enrollment.status === 'paused') continue;

      await inlineTask(`send-${index}`, {
        task: async () => {
          await req.frogbot.email.sendEmail({
            to: enrollment.email,
            subject: step.subject,
            text: `${step.subject}. Reply to this email if you need a hand.`,
          });

          return { output: {} };
        },
      });
    }

    await inlineTask('finish', {
      task: async () => {
        await req.frogbot.update({
          collection: 'enrollments',
          id: enrollmentId,
          data: { status: 'finished' },
          overrideAccess: true,
          req,
        });

        return { output: {} };
      },
    });
  },
};
```

Templates name these records for their users, such as "SLA timers" or "Sequence enrollments". When the list isn't enough, add a custom view with `admin.components.views` ([ADVANCED.md](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ADVANCED.md)) over the same collection. To end a run at once instead of at its next step, cancel its job with `frogbot.jobs.cancel` from code that isn't inside a save, such as an endpoint.

## Outgoing webhooks

Send a webhook from a task: the task's `retries` retry failures with backoff, and a fixed delivery ID lets the receiver ignore repeats. The headers use the [Standard Webhooks](https://www.standardwebhooks.com) names, signing `id.timestamp.body` with HMAC-SHA256:

```ts
// src/jobs/sendWebhook.ts
import { createHmac } from 'node:crypto';

import type { TaskConfig } from 'frogbot/jobs';

type Delivery = {
  input: { deliveryId: string; url: string; event: string; data: Record<string, unknown> };
  output: { status: number };
};

export const sendWebhook: TaskConfig<Delivery> = {
  slug: 'send-webhook',
  retries: { attempts: 6, backoff: { type: 'exponential', delay: 30_000 } },
  inputSchema: [
    { name: 'deliveryId', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
    { name: 'event', type: 'text', required: true },
    { name: 'data', type: 'json', required: true },
  ],
  outputSchema: [{ name: 'status', type: 'number', required: true }],
  async handler({ input }) {
    const body = JSON.stringify({ id: input.deliveryId, event: input.event, data: input.data });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(`${input.deliveryId}.${timestamp}.${body}`)
      .digest('base64');

    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': input.deliveryId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`${input.url} answered ${response.status}`);

    return { output: { status: response.status } };
  },
};
```

Queue one from a hook. The delivery ID is also the `jobId`, so two saves racing on the same change send once:

```ts
// src/collections/Deals.ts
import type { CollectionConfig } from 'frogbot';

export const Deals: CollectionConfig = {
  slug: 'deals',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'stage', type: 'select', options: ['open', 'won', 'lost'], defaultValue: 'open' },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (doc.stage !== 'won' || previousDoc?.stage === 'won') return doc;

        const deliveryId = `deal-won:${doc.id}:${String(doc.updatedAt)}`;

        await req.frogbot.jobs.queue({
          task: 'send-webhook',
          input: {
            deliveryId,
            url: process.env.DEAL_WEBHOOK_URL!,
            event: 'deal.won',
            data: { id: doc.id, name: doc.name },
          },
          jobId: deliveryId,
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
```

- Throwing retries the delivery; after the last attempt the job fails for good and keeps its error. Return instead of throwing for a status that won't improve, such as `410`.
- The receiver recomputes the signature with the shared secret, compares it with `timingSafeEqual`, rejects old timestamps, and skips a `webhook-id` it has already processed.
- With `deleteJobOnComplete: false` (below), the jobs collection is the delivery log: one record per delivery, with its attempts and last error.
- For many endpoints, keep them in a collection and queue one delivery per endpoint.

## See what ran

Run history is the jobs collection FrogBot already keeps. It is hidden in the admin by default. Turn it on in the app's config with `jobsCollectionOverrides`, limit reading to trusted users, since job input can hold customer data, and keep completed jobs, which are deleted by default. Create, update and delete stay denied. A role check is only as strong as the roles field: `rolesFieldAccess` stops a signed-in user from making themselves admin ([ACCESS-CONTROL-ADVANCED.md](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ACCESS-CONTROL-ADVANCED.md)). This whole file registers everything above:

```ts
// src/frogbot.config.ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createResend } from '@frogbotai/piece-resend';
import { allow, rolesPlugin } from '@frogbotai/plugin-roles';
import { buildConfig } from 'frogbot';

import { Deals } from './collections/Deals';
import { Enrollments } from './collections/Enrollments';
import { Tickets } from './collections/Tickets';
import { autoSolve } from './jobs/autoSolve';
import { followUp } from './jobs/followUp';
import { sendWebhook } from './jobs/sendWebhook';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! }, transactionOptions: {} }),
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  email: createResend({
    auth: { apiKey: process.env.RESEND_API_KEY! },
    from: { address: 'support@example.com', name: 'Support' },
  }),
  collections: [{ slug: 'users', auth: true, fields: [] }, Tickets, Enrollments, Deals],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'agent'],
      rolesFieldAccess: { create: allow('admin'), update: allow('admin') },
    }),
  ],
  jobs: {
    workflows: [autoSolve, followUp],
    tasks: [sendWebhook],
    autoRun: [{ cron: '* * * * *', allQueues: true }],
    deleteJobOnComplete: false,
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      access: {
        ...defaultJobsCollection.access,
        read: ({ req }) => {
          const roles = req.user && 'roles' in req.user ? req.user.roles : [];

          return Array.isArray(roles) && roles.includes('admin');
        },
      },
      admin: { ...defaultJobsCollection.admin, hidden: false },
    }),
  },
});
```

- Each record shows the task or workflow, its input, `totalTried`, `hasError` and `error`, the step `log`, `completedAt`, and `waitUntil` for a paused workflow.
- To run a failed job again, queue the same task or workflow with the same input.
- `autoRun` runs jobs inside the web process. For production workers and serverless hosts, see [Run workers](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md#run-workers). Keep a runner covering the `default` queue: it wakes paused workflows when their wait ends.

See [the jobs overview](https://docs.frogbot.ai/jobs-queue/overview) for every jobs option.

## Why no helper

An `automation({ when, wait, then })` wrapper would hide the transaction, the `jobId`, the steps and the access choice, which are exactly the parts that go wrong. The hook plus workflow above is about as short. Write the hook and the job.
