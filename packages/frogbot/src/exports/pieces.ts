import type { CredentialType, Piece } from '../types/piece.js';
import { executeActivepiecesAction, loadActivepiecesPiece, propertiesSchema } from '../pieces/activepieces.js';

export { UnsupportedPieceContextError } from '../pieces/activepieces.js';

export function createActivepiecesPiece({ module, service, credentialType, defaultActions, errorsAsResults = false }: {
  module: Record<string, unknown>;
  service: string;
  credentialType: CredentialType;
  defaultActions: readonly string[];
  errorsAsResults?: boolean;
}): Piece {
  const activepiecesPiece = loadActivepiecesPiece(module);
  const availableActions = Object.keys(activepiecesPiece.actions());
  return {
    service,
    credentialType,
    actions: availableActions,
    tools: ({ actions = defaultActions } = {}) => actions.map((actionName) => {
      const action = activepiecesPiece.getAction(actionName);
      if (!action) throw new Error(`[frogbot] Piece '${service}' has no action '${actionName}'.`);
      return {
        slug: `${service}_${actionName}`,
        description: action.description || action.displayName,
        inputSchema: propertiesSchema(action.props),
        execute: async (input: Record<string, unknown>, ctx) => {
          try {
            return await executeActivepiecesAction({ action, propsValue: input, ctx });
          } catch (error) {
            if (!errorsAsResults) throw error;
            return { error: error instanceof Error ? error.message : String(error) };
          }
        },
      };
    }),
  };
}
