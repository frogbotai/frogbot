import { createExa } from '@frogbotai/piece-exa';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const exa = createExa({ auth: { apiKey: 'key' } });

const answer = exa.generateAnswer({ input: { query: 'Why do frogs croak?' }, req });

expectTypeOf<Parameters<typeof exa.generateAnswer>[0]['input']>().toEqualTypeOf<{
  query: string;
  text?: boolean | undefined;
  model?: 'exa' | 'exa-pro' | undefined;
}>();
expectTypeOf(answer).toEqualTypeOf<Promise<string>>();

const _generateAnswerRejectsGetContentsInput = () =>
  // @ts-expect-error generateAnswer does not accept getContents input
  exa.generateAnswer({ input: { urls: ['https://example.com'] }, req });

const _contents = exa.getContents({ input: { urls: ['https://example.com'] }, req });

expectTypeOf<Awaited<typeof _contents>[number]['url']>().toEqualTypeOf<string>();
