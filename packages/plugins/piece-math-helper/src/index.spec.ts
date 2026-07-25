import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { mathHelper, mathHelperActions } from './index.js';

pieceContract({ piece: mathHelper, service: 'math_helper', credentialType: 'none', actions: mathHelperActions });
describe('math helper execution', () => { it('adds numbers', async () => { const [tool] = mathHelper.tools({ actions: ['addition_math'] }); await expect(tool.execute({ first_number: 2, second_number: 3 }, {} as never)).resolves.toBe(5); }); });
