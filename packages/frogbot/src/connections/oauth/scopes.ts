import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import type { PieceInstance } from '../../pieces/types.js';

/** The provider scope strings a piece instance requests: required scopes, then its configured names. */
export function oauthScopes(piece: PieceInstance): string[] {
  return pieceInstanceRuntime(piece).scopes;
}
