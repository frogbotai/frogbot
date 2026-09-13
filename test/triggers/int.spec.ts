import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const subscriptionsSlug = 'trigger-subscriptions';
const taskSlug = 'frogbot-run-agent-trigger';

describe('triggers', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);
  });

  it('reconciles declared subscriptions at boot', async () => {
    await vi.waitFor(
      async () => {
        expect(await booted.frogbot.triggers.list()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              agent: 'ops',
              instance: 'echo',
              trigger: 'subscribed',
              status: 'active',
              state: { enabled: 'alerts' },
              input: { value: { channel: 'alerts' } },
              webhookUrl: expect.stringMatching(
                /^http:\/\/127\.0\.0\.1:3988\/api\/webhooks\/echo\//,
              ),
            }),
            expect.objectContaining({
              agent: 'failing-handler',
              instance: 'echo',
              trigger: 'subscribed',
              status: 'active',
              input: { value: { channel: 'failures' } },
              state: { enabled: 'failures' },
            }),
          ]),
        );
      },
      { timeout: 10_000 },
    );
  });
  afterAll(async () => {
    await booted?.shutdown();
  });

  const deliver = ({
    body,
    instance = 'echo',
    subscription,
    signature = createHmac('sha256', 'echo-secret').update(body).digest('hex'),
  }: {
    body: string;
    instance?: string;
    subscription?: string | number;
    signature?: string;
  }) =>
    fetch(
      `${booted.baseUrl}/api/webhooks/${instance}${subscription === undefined ? '' : `/${subscription}`}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-echo-signature': signature },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );

  const findJobs = (eventID: string) =>
    booted.payload
      .find({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: taskSlug } },
        pagination: false,
        overrideAccess: true,
      })
      .then((result) => result.docs.filter((job) => job.input?.event?.dedupeKey === eventID));

  const findDeliveries = () =>
    booted.frogbot.find({
      collection: 'trigger-deliveries',
      pagination: false,
      overrideAccess: true,
    } as never);

  const runDeliveryJobs = async ({
    eventID,
    recipients,
    trigger,
  }: {
    eventID: string;
    recipients: { agent: string; message: string; instance?: string; handler?: string }[];
    trigger: string;
  }) => {
    const jobs = await findJobs(eventID);
    expect(jobs).toHaveLength(recipients.length);
    expect(jobs).toEqual(
      expect.arrayContaining(
        recipients.map(({ agent, message, instance = 'echo' }) =>
          expect.objectContaining({
            taskSlug,
            input: {
              agentSlug: agent,
              instanceSlug: instance,
              triggerSlug: trigger,
              event: { dedupeKey: eventID, data: { message } },
            },
          }),
        ),
      ),
    );
    for (const job of jobs) {
      expect(job.completedAt).toBeFalsy();
    }
    const messages = recipients.map(({ message }) => message);
    const deliveriesForEvent = async () =>
      (await findDeliveries()).docs.filter((doc) => messages.includes(doc.event.message));
    expect(await deliveriesForEvent()).toEqual([]);

    await booted.payload.jobs.run({
      allQueues: true,
      where: { id: { in: jobs.map((job) => job.id) } },
    });

    const deliveries = await deliveriesForEvent();
    expect(deliveries).toHaveLength(recipients.length);
    expect(deliveries).toEqual(
      expect.arrayContaining(
        recipients.map(({ agent, message, instance = 'echo', handler = agent }) =>
          expect.objectContaining({
            agent,
            handler,
            event: { message },
            context: { trigger: { piece: instance, trigger, agent } },
            request: { hasHeaders: true, hasUser: false, matchesAgent: true },
          }),
        ),
      ),
    );
    const completed = await findJobs(eventID);
    expect(completed).toHaveLength(recipients.length);
    for (const job of completed) {
      expect(job.completedAt).toEqual(expect.any(String));
      expect(job.hasError).toBe(false);
    }
  };

  it('registers a hidden, externally closed subscriptions collection', async () => {
    const collection = booted.payload.config.collections.find(
      ({ slug }) => slug === subscriptionsSlug,
    );

    expect(collection?.admin?.hidden).toBe(true);
    await expect(booted.restClient.get(`/api/${subscriptionsSlug}`)).resolves.toMatchObject({
      status: 403,
    });
    await expect(
      booted.restClient.post(`/api/${subscriptionsSlug}`, {
        agent: 'internal',
        piece: 'echo',
        instance: 'echo',
        trigger: 'subscribed',
        inputHash: 'external',
        input: { value: { channel: 'alerts' } },
        status: 'active',
      }),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('creates and reads a subscription internally', async () => {
    const created = await booted.frogbot.create({
      collection: subscriptionsSlug,
      data: {
        agent: 'internal',
        piece: 'echo',
        instance: 'echo',
        trigger: 'subscribed',
        inputHash: 'internal',
        input: { value: { channel: 'alerts' } },
        status: 'active',
      },
      overrideAccess: true,
    } as never);
    const subscription = await booted.frogbot.findByID({
      collection: subscriptionsSlug,
      id: created.id,
      overrideAccess: true,
    } as never);

    expect(subscription).toMatchObject({
      id: created.id,
      agent: 'internal',
      instance: 'echo',
      trigger: 'subscribed',
      input: { value: { channel: 'alerts' } },
      status: 'active',
    });
  });

  it('delivers a signed app event once per recipient from root trigger mounts', async () => {
    const body = '{ "event": "received", "id": "app-event", "message": "hello 🌍" }';
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await deliver({ body });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
    await runDeliveryJobs({
      eventID: 'app-event',
      recipients: ['app-primary', 'app-secondary'].map((agent) => ({
        agent,
        message: 'echo: hello 🌍',
      })),
      trigger: 'received',
    });
    expect((await deliver({ body })).status).toBe(200);
    expect(await findJobs('app-event')).toHaveLength(2);
    await booted.payload.jobs.run({ allQueues: true });
    expect(
      (await findDeliveries()).docs.filter((doc) => doc.event.message === 'echo: hello 🌍'),
    ).toHaveLength(2);
  });

  it('delivers a signed subscription event through a persisted job to its handler', async () => {
    const subscription = (await booted.frogbot.triggers.list()).find((row) => row.agent === 'ops')!;
    const body = JSON.stringify({ id: 'subscription-event', message: 'subscribed delivery' });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await deliver({ body, subscription: subscription.id })).status).toBe(200);
    }
    await runDeliveryJobs({
      eventID: 'subscription-event',
      recipients: [{ agent: 'ops', message: 'echo: subscribed delivery' }],
      trigger: 'subscribed',
    });
  });

  it('isolates routes, options, handlers, and dedupe for two named instances of the same trigger', async () => {
    const { echoCalls } = await import('./config.js');
    const eventID = 'named-instance-event';
    const body = JSON.stringify({ event: 'received', id: eventID, message: 'named delivery' });
    const recipients = ['east', 'west'].map((name) => ({
      agent: 'named-instances',
      instance: `echo-${name}`,
      handler: name,
      message: `${name}: named delivery`,
    }));

    expect((await deliver({ body, instance: 'echo-east' })).status).toBe(200);
    expect(await findJobs(eventID)).toHaveLength(1);
    expect((await findJobs(eventID))[0].input?.instanceSlug).toBe('echo-east');
    expect((await deliver({ body, instance: 'echo-west' })).status).toBe(200);
    for (const { instance, handler } of recipients) {
      expect((await deliver({ body, instance })).status).toBe(200);
      expect(echoCalls).toContainEqual(
        expect.objectContaining({
          type: 'app',
          data: { event: 'received', id: eventID, message: 'named delivery' },
          options: { prefix: `${handler}: ` },
          client: { prefix: `${handler}: ` },
        }),
      );
    }

    await runDeliveryJobs({ eventID, recipients, trigger: 'received' });
    const completed = await findJobs(eventID);
    for (const { instance } of recipients) {
      expect((await deliver({ body, instance })).status).toBe(200);
    }
    expect((await findJobs(eventID)).map(({ id }) => id).sort()).toEqual(
      completed.map(({ id }) => id).sort(),
    );
    await booted.payload.jobs.run({
      allQueues: true,
      where: { id: { in: completed.map(({ id }) => id) } },
    });
    expect(
      (await findDeliveries()).docs.filter((doc) =>
        recipients.some(({ message }) => doc.event.message === message),
      ),
    ).toHaveLength(2);
  });

  it.each(['app', 'subscription'] as const)(
    'retries an overlapping signed %s delivery without duplicating recipients',
    async (route) => {
      const eventID = `overlapping-${route}`;
      const message = `echo: ${eventID}`;
      const body = JSON.stringify({ event: 'received', id: eventID, message: eventID });
      const subscription =
        route === 'subscription'
          ? (await booted.frogbot.triggers.list()).find((row) => row.agent === 'ops')!.id
          : undefined;
      const queue = booted.frogbot.queue.bind(booted.frogbot);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let holding = false;
      const enqueue = vi.spyOn(booted.frogbot, 'queue').mockImplementationOnce(async (args) => {
        holding = true;
        await held;
        await queue(args);
      });
      const first = deliver({ body, subscription });
      try {
        await vi.waitFor(() => expect(holding).toBe(true));
        const second = await deliver({ body, subscription });
        expect(second.status === 429 || second.status >= 500).toBe(true);
        expect(
          (await findDeliveries()).docs.filter((doc) => doc.event.message === message),
        ).toEqual([]);
      } finally {
        release();
        await first.finally(() => enqueue.mockRestore());
      }
      expect((await first).status).toBe(200);
      expect((await deliver({ body, subscription })).status).toBe(200);
      await runDeliveryJobs({
        eventID,
        trigger: route === 'app' ? 'received' : 'subscribed',
        recipients: (route === 'app' ? ['app-primary', 'app-secondary'] : ['ops']).map((agent) => ({
          agent,
          message,
        })),
      });
    },
  );

  it('retries a single enqueue failure without losing or duplicating the subscription delivery', async () => {
    const subscription = (await booted.frogbot.triggers.list()).find((row) => row.agent === 'ops')!;
    const eventID = 'enqueue-failure';
    const body = JSON.stringify({ id: eventID, message: 'enqueue retry' });
    const enqueue = vi
      .spyOn(booted.frogbot, 'queue')
      .mockRejectedValueOnce(new Error('Intentional enqueue failure'));
    try {
      const response = await deliver({ body, subscription: subscription.id });
      expect(response.status === 429 || response.status >= 500).toBe(true);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(await findJobs(eventID)).toEqual([]);
    } finally {
      enqueue.mockRestore();
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await deliver({ body, subscription: subscription.id })).status).toBe(200);
    }
    await runDeliveryJobs({
      eventID,
      trigger: 'subscribed',
      recipients: [{ agent: 'ops', message: 'echo: enqueue retry' }],
    });
  });

  it('retries partial app fanout without repeating a successful recipient', async () => {
    const eventID = 'partial-fanout';
    const message = 'echo: partial fanout';
    const body = JSON.stringify({ event: 'received', id: eventID, message: 'partial fanout' });
    const queue = booted.frogbot.queue.bind(booted.frogbot);
    let primaryQueued!: () => void;
    const queued = new Promise<void>((resolve) => {
      primaryQueued = resolve;
    });
    const enqueue = vi.spyOn(booted.frogbot, 'queue').mockImplementation(async (args) => {
      if ((args.input as { agentSlug: string }).agentSlug === 'app-secondary') {
        await queued;
        throw new Error('Intentional secondary enqueue failure');
      }
      await queue(args);
      primaryQueued();
    });
    try {
      const response = await deliver({ body });
      expect(response.status === 429 || response.status >= 500).toBe(true);
      expect(enqueue).toHaveBeenCalledTimes(2);
    } finally {
      enqueue.mockRestore();
    }
    await runDeliveryJobs({
      eventID,
      trigger: 'received',
      recipients: [{ agent: 'app-primary', message }],
    });
    const [primary] = await findJobs(eventID);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await deliver({ body })).status).toBe(200);
    }
    const jobs = await findJobs(eventID);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.input?.agentSlug).sort()).toEqual([
      'app-primary',
      'app-secondary',
    ]);
    expect(jobs.find(({ id }) => id === primary.id)?.completedAt).toBe(primary.completedAt);
    await booted.payload.jobs.run({
      allQueues: true,
      where: { id: { in: jobs.map(({ id }) => id) } },
    });
    const deliveries = (await findDeliveries()).docs.filter((doc) => doc.event.message === message);
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map(({ handler }) => handler).sort()).toEqual([
      'app-primary',
      'app-secondary',
    ]);
    for (const job of await findJobs(eventID)) {
      expect(job.completedAt).toEqual(expect.any(String));
      expect(job.hasError).toBe(false);
    }
  });

  it('persists a failed handler job without marking it completed', async () => {
    const { failedHandlerCalls } = await import('./config.js');
    const subscription = (await booted.frogbot.triggers.list()).find(
      (row) => row.agent === 'failing-handler',
    )!;
    const eventID = 'handler-failure';
    const body = JSON.stringify({ id: eventID, message: 'handler failure' });
    expect((await deliver({ body, subscription: subscription.id })).status).toBe(200);
    const jobs = await findJobs(eventID);
    expect(jobs).toHaveLength(1);
    expect(failedHandlerCalls).toEqual([]);
    await booted.payload.jobs.run({ allQueues: true, where: { id: { equals: jobs[0].id } } });

    const failed = await findJobs(eventID);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      id: jobs[0].id,
      hasError: true,
      processing: false,
      totalTried: 1,
      error: expect.objectContaining({
        message: expect.stringContaining('Intentional trigger handler failure'),
      }),
      log: expect.arrayContaining([expect.objectContaining({ state: 'failed', taskSlug })]),
    });
    expect(failed[0].completedAt).toBeFalsy();
    expect(failedHandlerCalls).toEqual([{ message: 'echo: handler failure' }]);
    expect((await findDeliveries()).docs.filter((doc) => doc.agent === 'failing-handler')).toEqual(
      [],
    );
  });

  it('rejects tampered signed bodies on app and subscription routes without queuing jobs', async () => {
    const subscription = (await booted.frogbot.triggers.list()).find((row) => row.agent === 'ops')!;
    const body = JSON.stringify({ event: 'received', id: 'invalid-event', message: 'original' });
    const signature = createHmac('sha256', 'echo-secret').update(body).digest('hex');
    const before = (await findDeliveries()).totalDocs;
    for (const id of [undefined, subscription.id]) {
      const response = await deliver({
        body: body.replace('original', 'tampered'),
        signature,
        subscription: id,
      });
      expect(response.status).toBe(401);
    }
    expect(await findJobs('invalid-event')).toEqual([]);
    expect((await findDeliveries()).totalDocs).toBe(before);
  });

  it('returns 404 for a signed delivery to an unknown subscription', async () => {
    const response = await deliver({
      body: JSON.stringify({ id: 'unknown-event', message: 'unknown' }),
      subscription: '000000000000000000000000',
    });
    expect(response.status).toBe(404);
    expect(await findJobs('unknown-event')).toEqual([]);
  });

  it('enables, delivers to, and disables a subscription beyond the first ledger page', async () => {
    const { echoCalls } = await import('./config.js');
    const prior = (await booted.frogbot.triggers.list()).find((row) => row.agent === 'ops')!;
    await booted.frogbot.triggers.disable(prior.id);

    const createUnrelatedRows = async (prefix: string) => {
      for (let index = 0; index < 11; index++) {
        await booted.frogbot.create({
          collection: subscriptionsSlug,
          data: {
            agent: `${prefix}-${index}`,
            piece: 'echo',
            instance: 'echo',
            trigger: 'subscribed',
            inputHash: `${prefix}-${index}`,
            input: { value: { channel: 'unrelated' } },
            status: 'active',
          },
          overrideAccess: true,
        } as never);
      }
    };
    await createUnrelatedRows('before');
    const subscription = await booted.frogbot.triggers.enable({
      agent: 'ops',
      instance: 'echo',
      trigger: 'subscribed',
      input: { channel: 'runtime' },
    });
    expect(subscription).toMatchObject({
      status: 'active',
      input: { value: { channel: 'runtime' } },
      state: { enabled: 'runtime' },
    });
    expect(echoCalls).toContainEqual(
      expect.objectContaining({
        type: 'enable',
        input: { channel: 'runtime' },
        webhookUrl: `http://127.0.0.1:3988/api/webhooks/echo/${subscription.id}`,
      }),
    );
    await createUnrelatedRows('after');
    const firstPage = await booted.frogbot.find({
      collection: subscriptionsSlug,
      overrideAccess: true,
    } as never);
    expect(firstPage.docs).toHaveLength(10);
    expect(firstPage.docs.map((row) => row.id)).not.toContain(subscription.id);
    expect(await booted.frogbot.triggers.list()).toContainEqual(
      expect.objectContaining({ id: subscription.id }),
    );

    const body = JSON.stringify({ id: 'late-event', message: 'late delivery' });
    expect((await deliver({ body, subscription: subscription.id })).status).toBe(200);
    await runDeliveryJobs({
      eventID: 'late-event',
      recipients: [{ agent: 'ops', message: 'echo: late delivery' }],
      trigger: 'subscribed',
    });
    expect(echoCalls).toContainEqual(
      expect.objectContaining({ type: 'webhook', input: { channel: 'runtime' } }),
    );

    await booted.frogbot.triggers.disable(subscription.id);
    expect(echoCalls).toContainEqual(
      expect.objectContaining({
        type: 'disable',
        input: { channel: 'runtime' },
        state: { enabled: 'runtime' },
      }),
    );
    expect((await booted.frogbot.triggers.list()).map((row) => row.id)).not.toContain(
      subscription.id,
    );
    expect((await deliver({ body, subscription: subscription.id })).status).toBe(404);
    expect(await findJobs('late-event')).toHaveLength(1);
  });
});
