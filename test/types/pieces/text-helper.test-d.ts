import { createTextHelper } from '@frogbotai/piece-text-helper';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const textHelper = createTextHelper();

const parts = textHelper.splitText({ input: { text: 'a,b', delimiter: ',' }, req });

expectTypeOf<Parameters<typeof textHelper.splitText>[0]['input']>().toEqualTypeOf<{
  text: string;
  delimiter: string;
}>();
expectTypeOf(parts).toEqualTypeOf<Promise<string[]>>();

// @ts-expect-error splitText does not accept concatText input
textHelper.splitText({ input: { texts: ['a', 'b'] }, req });

expectTypeOf(textHelper.findText({ input: { text: 'frog', expression: 'r' }, req })).toEqualTypeOf<
  Promise<string[] | null>
>();
