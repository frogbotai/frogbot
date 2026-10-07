import { createMathHelper } from '@frogbotai/piece-math-helper';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const mathHelper = createMathHelper();

const sum = mathHelper.addNumbers({ input: { firstNumber: 1, secondNumber: 2 }, req });

expectTypeOf<Parameters<typeof mathHelper.addNumbers>[0]['input']>().toEqualTypeOf<{
  firstNumber: number;
  secondNumber: number;
}>();

expectTypeOf(sum).toEqualTypeOf<Promise<number>>();

const _addNumbersRequiresBothNumbers = () =>
  // @ts-expect-error addNumbers requires both numbers
  mathHelper.addNumbers({ input: { firstNumber: 1 }, req });
