import * as module from '@activepieces/piece-graphql';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const graphqlActions = ['send_request'] as const;
export const graphqlScopes = [] as const;

export function createGraphql(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "graphql",
    credentialType: "none",
    defaultActions: graphqlActions,
    scopes: graphqlScopes,
    config,
    errorsAsResults: true,
  });
  return Object.assign(piece, {
    /** Send Request: Makes a GraphQL request. */
    sendRequest: piece.tool("send_request"),
  });
}
