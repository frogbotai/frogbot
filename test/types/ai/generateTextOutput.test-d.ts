import { type FrogBotInstance, type GenerateTextOpts, Output, type StreamTextOpts } from 'frogbot';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

declare const frogbot: FrogBotInstance;

const triage = Output.object({
  schema: z.object({ priority: z.enum(['low', 'high']), team: z.string() }),
});

type Triage = { priority: 'low' | 'high'; team: string };

const generated = await frogbot.generateText({
  model: 'openai/gpt-4o',
  prompt: 'Classify',
  output: triage,
});

expectTypeOf(generated.output).toEqualTypeOf<Triage>();

const streamed = await frogbot.streamText({
  model: 'openai/gpt-4o',
  prompt: 'Classify',
  output: triage,
});

expectTypeOf(await streamed.output).toEqualTypeOf<Triage>();

const tags = await frogbot.generateText({
  model: 'openai/gpt-4o',
  prompt: 'Tag it',
  output: Output.array({ element: z.string() }),
});

expectTypeOf(tags.output).toEqualTypeOf<string[]>();

const plain = await frogbot.generateText({ model: 'openai/gpt-4o', prompt: 'Hello' });

expectTypeOf(plain.output).toEqualTypeOf<string>();
expectTypeOf(plain.text).toEqualTypeOf<string>();

const plainStream = await frogbot.streamText({ model: 'openai/gpt-4o', prompt: 'Hello' });

expectTypeOf(await plainStream.output).toEqualTypeOf<string>();

const annotated: GenerateTextOpts = {
  model: 'openai/gpt-4o',
  prompt: 'Tag it',
  output: Output.json(),
};

expectTypeOf((await frogbot.generateText(annotated)).output).toBeAny();

const annotatedStream: StreamTextOpts = {
  model: 'openai/gpt-4o',
  prompt: 'Tag it',
  output: Output.object({ schema: z.object({ tag: z.string() }) }),
};

expectTypeOf(await (await frogbot.streamText(annotatedStream)).output).toBeAny();
