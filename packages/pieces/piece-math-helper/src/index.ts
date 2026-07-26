import * as module from '@activepieces/piece-math-helper';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const mathHelperActions = ['addition_math', 'subtraction_math', 'multiplication_math', 'division_math', 'modulo_math', 'generateRandom_math'] as const;
export const mathHelperScopes = [] as const;

export function createMathHelper(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "math_helper",
    credentialType: "none",
    defaultActions: mathHelperActions,
    scopes: mathHelperScopes,
    config,
  });
  return Object.assign(piece, {
    /** Addition: Add the first number and the second number */
    additionMath: piece.tool("addition_math"),
    /** Subtraction: Subtract the first number from the second number */
    subtractionMath: piece.tool("subtraction_math"),
    /** Multiplication: Multiply first number by the second number */
    multiplicationMath: piece.tool("multiplication_math"),
    /** Division: Divide first number by the second number */
    divisionMath: piece.tool("division_math"),
    /** Modulo: Get the remainder of the first number divided by second number */
    moduloMath: piece.tool("modulo_math"),
    /** Generate Random Number: Generate random number between two numbers (inclusive) */
    generateRandomMath: piece.tool("generateRandom_math"),
  });
}
