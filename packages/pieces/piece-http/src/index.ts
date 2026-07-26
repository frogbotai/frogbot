import * as module from '@activepieces/piece-http';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const httpActions = ['send_request', 'parse_url'] as const;
export const httpScopes = [] as const;

export function createHttp(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "http",
    credentialType: "none",
    defaultActions: httpActions,
    scopes: httpScopes,
    config,
    errorsAsResults: true,
  });
  return Object.assign(piece, {
    /** Send HTTP request: Send HTTP request */
    sendRequest: piece.tool("send_request"),
    /** Parse URL: Extract the domain, path, and query parameters from a URL. */
    parseUrl: piece.tool("parse_url"),
  });
}
