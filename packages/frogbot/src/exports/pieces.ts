import type { CredentialType, Piece } from '../types/piece.js';
import { executeActivepiecesAction, loadActivepiecesPiece, propertiesSchema } from '../pieces/activepieces.js';
import { ConnectionError } from '../connections/api.js';

export { UnsupportedPieceContextError } from '../pieces/activepieces.js';

export function createActivepiecesPiece({ module, service, credentialType, credentialFields, defaultActions, errorsAsResults = false }: {
  module: Record<string, unknown>;
  service: string;
  credentialType: CredentialType;
  defaultActions: readonly string[];
  credentialFields?: Piece['credentialFields'];
  errorsAsResults?: boolean;
}): Piece {
  const activepiecesPiece = loadActivepiecesPiece(module);
  const availableActions = Object.keys(activepiecesPiece.actions());
  return {
    service,
    credentialType,
    credentialFields,
    actions: availableActions,
    tools: ({ actions = defaultActions } = {}) => actions.map((actionName) => {
      const action = activepiecesPiece.getAction(actionName);
      if (!action) throw new Error(`[frogbot] Piece '${service}' has no action '${actionName}'.`);
      return {
        slug: `${service}_${actionName}`,
        description: action.description || action.displayName,
        inputSchema: propertiesSchema(action.props),
        execute: async (input: Record<string, unknown>, ctx) => {
          if (credentialType !== 'none' && !ctx.req.user) {
            return { error: `Authentication is required to use '${service}'.`, code: 'unauthenticated' };
          }
          try {
            const auth = credentialType === 'none'
              ? undefined
              : await ctx.frogbot.connections.resolve({ service, owner: ctx.req.user! });
            return await executeActivepiecesAction({ action, propsValue: input, auth, ctx });
          } catch (error) {
            if (error instanceof ConnectionError) {
              return { error: error.message, code: error.code };
            }
            if (!errorsAsResults) throw error;
            return { error: error instanceof Error ? error.message : String(error) };
          }
        },
      };
    }),
  };
}
