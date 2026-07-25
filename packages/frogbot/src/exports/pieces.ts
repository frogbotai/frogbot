import type { CredentialType, Piece } from '../types/piece.js';
import { executeActivepiecesAction, loadActivepiecesPiece, propertiesSchema } from '../pieces/activepieces.js';

export { UnsupportedPieceContextError } from '../pieces/activepieces.js';

export function createActivepiecesPiece({ module, service, credentialType, defaultActions }: {
  module: Record<string, unknown>;
  service: string;
  credentialType: CredentialType;
  defaultActions: readonly string[];
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
        execute: (input: Record<string, unknown>) => executeActivepiecesAction({ action, propsValue: input }),
      };
    }),
  };
}
