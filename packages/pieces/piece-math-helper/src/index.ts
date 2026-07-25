import * as module from '@activepieces/piece-math-helper';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const mathHelperActions = ['addition_math', 'subtraction_math', 'multiplication_math', 'division_math', 'modulo_math', 'generateRandom_math'] as const;
export const mathHelper = createActivepiecesPiece({ module, service: 'math_helper', credentialType: 'none', defaultActions: mathHelperActions });
