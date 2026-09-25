import type { FrogBot, FrogBotTypes, Jobs, UntypedFrogBotTypes } from 'frogbot';
import { expectTypeOf } from 'vitest';

type QueueArgs = Parameters<Jobs['queue']>[0];

expectTypeOf<FrogBotTypes['jobs']>().toEqualTypeOf<UntypedFrogBotTypes['jobs']>();
expectTypeOf<{ task: 'unregistered'; input: { value: number } }>().toMatchTypeOf<QueueArgs>();
expectTypeOf<{ workflow: 'unregistered'; input: { value: string } }>().toMatchTypeOf<QueueArgs>();
expectTypeOf<{ task: 'unregistered'; input: undefined }>().toMatchTypeOf<QueueArgs>();
expectTypeOf<{ task: 'unregistered' }>().not.toMatchTypeOf<QueueArgs>();
expectTypeOf<{ input: Record<never, never> }>().not.toMatchTypeOf<QueueArgs>();

expectTypeOf<{
  task: 'one';
  workflow: 'two';
  input: Record<never, never>;
}>().not.toMatchTypeOf<QueueArgs>();

export async function jobsBeforeGeneration(frogbot: FrogBot) {
  await frogbot.jobs.queue({ task: 'arbitrary-task', input: { nested: { count: 1 } } });
  await frogbot.jobs.queue({ task: 'inputless-task', input: undefined });
  await frogbot.jobs.queue({ workflow: 'arbitrary-workflow', input: { ids: [1, 2] } });
}
