import {
  type AgentConfig,
  type AgentGenerateResult,
  type AgentInstance,
  type AgentStreamResult,
  Output,
} from 'frogbot';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

declare const agent: AgentInstance;

const triage = Output.object({
  schema: z.object({ priority: z.enum(['low', 'high']), team: z.string() }),
});

type Triage = { priority: 'low' | 'high'; team: string };

const generated = await agent.generate({ prompt: 'Classify', output: triage });

expectTypeOf(generated.output).toEqualTypeOf<Triage>();

const streamed = await agent.stream({ prompt: 'Classify', output: triage });

expectTypeOf(await streamed.output).toEqualTypeOf<Triage>();

const team = await agent.generate({
  prompt: 'Pick a team',
  output: Output.choice({ options: ['billing', 'support'] }),
});

expectTypeOf(team.output).toEqualTypeOf<'billing' | 'support'>();

const plain = await agent.generate({ prompt: 'Hello' });

expectTypeOf(plain).toEqualTypeOf<AgentGenerateResult>();
expectTypeOf(plain.output).toBeNever();

const plainStream = await agent.stream({ prompt: 'Hello' });

expectTypeOf(plainStream).toEqualTypeOf<AgentStreamResult>();

const message = await agent.streamMessage({
  prompt: 'Hello',
  chatId: 'chat-1',
  // @ts-expect-error Chat turns reply in text; they take no `output`.
  output: triage,
});

void message;

const withOutput: AgentConfig = {
  slug: 'triage',
  instructions: 'Classify tickets',
  // @ts-expect-error `output` is per call, not an agent default.
  output: triage,
};

void withOutput;
