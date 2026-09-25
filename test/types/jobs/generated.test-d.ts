import type { FrogBot, FrogBotTypes, JobQueueArgs, Jobs } from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { Config } from './.generated/frogbot-types.js';

type QueueArgs = Parameters<Jobs['queue']>[0];

expectTypeOf<FrogBotTypes['jobs']>().toEqualTypeOf<Config['jobs']>();
expectTypeOf<FrogBot['jobs']>().toEqualTypeOf<Jobs>();

expectTypeOf<{
  task: 'unknown-task';
  input: Record<never, never>;
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{
  workflow: 'unknown-workflow';
  input: Record<never, never>;
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{ task: 'send-notification' }>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{ task: 'send-notification'; input: Record<never, never> }>().not.toMatchTypeOf<
  JobQueueArgs<'send-notification'>
>();

expectTypeOf<{ task: 'send-notification'; input: { recipient: number } }>().not.toMatchTypeOf<
  JobQueueArgs<'send-notification'>
>();

expectTypeOf<{
  task: 'send-notification';
  input: { count: number };
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{
  task: 'count-items';
  input: { recipient: string };
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{ workflow: 'onboard-account' }>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{ workflow: 'onboard-account'; input: Record<never, never> }>().not.toMatchTypeOf<
  JobQueueArgs<'onboard-account'>
>();

expectTypeOf<{ workflow: 'onboard-account'; input: { accountID: string } }>().not.toMatchTypeOf<
  JobQueueArgs<'onboard-account'>
>();

expectTypeOf<{
  workflow: 'send-notification';
  input: { recipient: string };
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{
  task: 'onboard-account';
  input: { accountID: number };
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{
  task: 'send-notification';
  workflow: 'onboard-account';
  input: { recipient: string; accountID: number };
}>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{ input: { recipient: string } }>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{
  task: 'send-notification';
  input: { recipient: string };
  jobId: number;
}>().not.toMatchTypeOf<QueueArgs>();

export async function generatedJobs(frogbot: FrogBot) {
  const notification = await frogbot.jobs.queue({
    task: 'send-notification',
    input: { recipient: 'owner@example.com' },
    jobId: 'notification',
    queue: 'email',
    waitUntil: new Date(),
    overrideAccess: false,
    meta: { scheduled: false, source: 'type-fixture' },
  });

  expectTypeOf(notification.input).toEqualTypeOf<{ recipient: string }>();
  expectTypeOf(notification.id).toEqualTypeOf<number | string>();
  expectTypeOf(notification.taskStatus['send-notification']['notify'].input).toEqualTypeOf<{
    recipient: string;
  }>();

  expectTypeOf(notification.taskStatus['send-notification']['notify'].output).toEqualTypeOf<{
    delivered: boolean;
  }>();

  const onboarding = await frogbot.jobs.queue({
    workflow: 'onboard-account',
    input: { accountID: 42 },
  });

  expectTypeOf(onboarding.input).toEqualTypeOf<{ accountID: number }>();
  expectTypeOf(onboarding.taskStatus['count-items']['count'].output).toEqualTypeOf<{
    total: number;
  }>();

  const count = await frogbot.jobs.queue<'count-items'>({
    task: 'count-items',
    input: { count: 3 },
  });

  expectTypeOf(count.input).toEqualTypeOf<{ count: number }>();
}
