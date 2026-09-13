import { adaptCredential } from '../connections/adapters.js';
import { ConnectionError } from '../connections/api.js';
import {
  executeActivepiecesAction,
  loadActivepiecesPiece,
  propertiesSchema,
} from '../pieces/activepieces.js';
import type {
  CredentialType,
  LegacyPiece,
  PieceFactoryConfig,
  PiecePolicy,
} from '../pieces/types.js';
import type { AnyTool } from '../tools/types.js';

export { UnsupportedPieceContextError } from '../pieces/activepieces.js';
export { definePiece } from '../pieces/definePiece.js';
export type { EmailPiece } from '../pieces/email.js';
export type * from '../pieces/types.js';

function derivePolicy(
  credentialType: CredentialType,
  auth?: PieceFactoryConfig['auth'],
): PiecePolicy {
  if (auth?.allowUserOverride) {
    throw new Error('[frogbot] `allowUserOverride` is not yet supported.');
  }
  if (credentialType === 'none') return { type: 'none' };
  if (!auth) return { type: 'user' };
  if (credentialType === 'oauth2') {
    const { clientId, clientSecret } = auth;
    if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
      throw new Error('[frogbot] OAuth piece auth requires `clientId` and `clientSecret`.');
    }
    return { type: 'oauth', clientId, clientSecret };
  }
  const { allowUserOverride: _, ...credential } = auth;
  return { type: 'developer', credential };
}

export function createActivepiecesPiece({
  module,
  service,
  credentialType,
  credentialFields,
  defaultActions,
  errorsAsResults = false,
  config,
  scopes,
}: {
  module: Record<string, unknown>;
  service: string;
  credentialType: CredentialType;
  defaultActions: readonly string[];
  credentialFields?: LegacyPiece['credentialFields'];
  errorsAsResults?: boolean;
  config?: PieceFactoryConfig;
  scopes?: readonly string[];
}): LegacyPiece {
  const activepiecesPiece = loadActivepiecesPiece(module);
  const availableActions = Object.keys(activepiecesPiece.actions());
  const policy = derivePolicy(credentialType, config?.auth);
  const tool = (actionName: string): AnyTool => {
    const action = activepiecesPiece.getAction(actionName);
    if (!action) throw new Error(`[frogbot] Piece '${service}' has no action '${actionName}'.`);
    return {
      slug: `${service}_${actionName}`,
      pieceService: service,
      description: action.description || action.displayName,
      inputSchema: propertiesSchema(action.props),
      execute: async (input: Record<string, unknown>, ctx) => {
        if (credentialType !== 'none' && policy.type !== 'developer' && !ctx.req.user) {
          return {
            error: `Authentication is required to use '${service}'.`,
            code: 'unauthenticated',
          };
        }
        try {
          if (credentialType !== 'none' && policy.type !== 'developer') {
            throw new ConnectionError(
              `User connections for legacy piece '${service}' require a native piece instance.`,
              'missing',
              undefined,
              service,
            );
          }
          const auth =
            credentialType === 'none'
              ? undefined
              : await adaptCredential(
                  credentialType,
                  policy.type === 'developer' ? (policy.credential as Record<string, unknown>) : {},
                );
          return await executeActivepiecesAction({ action, propsValue: input, auth, ctx });
        } catch (error) {
          if (error instanceof ConnectionError) return { error: error.message, code: error.code };
          if (!errorsAsResults) throw error;
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    };
  };
  return {
    service,
    credentialType,
    credentialFields,
    policy,
    actions: availableActions,
    scopes,
    tool,
    tools: ({ actions = defaultActions } = {}) => actions.map(tool),
  };
}
