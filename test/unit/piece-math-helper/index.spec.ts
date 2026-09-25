import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));
vi.mock('../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));

import { pieceActionDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createMathHelper } from '../../../packages/pieces/piece-math-helper/src/index.js';

const mathHelper = createMathHelper();
const req = {} as never;
const actions = [
  'addNumbers',
  'subtractNumbers',
  'multiplyNumbers',
  'divideNumbers',
  'getRemainder',
  'generateRandomNumber',
] as const;

describe('math helper', () => {
  it('exposes every upstream action under a semantic native name', () => {
    expect(Object.keys(mathHelper)).toEqual(['slug', 'piece', 'triggers', 'client', ...actions]);
  });

  it('requires number inputs for every action', async () => {
    for (const action of actions) {
      await expect(
        mathHelper[action]({ input: { firstNumber: '1', secondNumber: 2 }, req }),
      ).rejects.toThrow();
    }
  });

  it('declares and executes through numeric output schemas', async () => {
    for (const action of actions) {
      expect(pieceActionDefinition(mathHelper[action])?.output).toBeDefined();
    }

    const definition = pieceActionDefinition(mathHelper.addNumbers);
    const parse = vi.spyOn(definition!.output!, 'parse');

    await expect(
      mathHelper.addNumbers({ input: { firstNumber: 1, secondNumber: 2 }, req }),
    ).resolves.toBe(3);

    expect(parse).toHaveBeenCalledWith(3);
  });

  it('performs each deterministic operation with upstream operand order', async () => {
    const input = { firstNumber: 6, secondNumber: 4 };

    await expect(mathHelper.addNumbers({ input, req })).resolves.toBe(10);
    await expect(mathHelper.subtractNumbers({ input, req })).resolves.toBe(-2);
    await expect(mathHelper.multiplyNumbers({ input, req })).resolves.toBe(24);
    await expect(mathHelper.divideNumbers({ input, req })).resolves.toBe(1.5);
    await expect(mathHelper.getRemainder({ input, req })).resolves.toBe(2);
  });

  it('rejects division by positive and negative zero with the upstream message', async () => {
    await expect(
      mathHelper.divideNumbers({ input: { firstNumber: 6, secondNumber: 0 }, req }),
    ).rejects.toThrow('Second number cannot be zero');

    await expect(
      mathHelper.divideNumbers({ input: { firstNumber: 6, secondNumber: -0 }, req }),
    ).rejects.toThrow('Second number cannot be zero');
  });

  it('rejects a non-numeric remainder result through its output schema', async () => {
    await expect(
      mathHelper.getRemainder({ input: { firstNumber: 6, secondNumber: 0 }, req }),
    ).rejects.toThrow();
  });

  it('generates inclusive integers using the upstream formula', async () => {
    const random = vi.spyOn(Math, 'random');

    random.mockReturnValueOnce(0).mockReturnValueOnce(0.9999999999999999);

    await expect(
      mathHelper.generateRandomNumber({ input: { firstNumber: 3, secondNumber: 7 }, req }),
    ).resolves.toBe(3);

    await expect(
      mathHelper.generateRandomNumber({ input: { firstNumber: 3, secondNumber: 7 }, req }),
    ).resolves.toBe(7);

    random.mockRestore();
  });
});
