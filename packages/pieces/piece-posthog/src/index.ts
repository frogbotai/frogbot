import * as module from '@activepieces/piece-posthog';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const posthogActions = ['create_event', 'create_project'] as const;
export const posthogScopes = [] as const;

export function createPosthog(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "posthog",
    credentialType: "secret_text",
    defaultActions: posthogActions,
    scopes: posthogScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Event: Create an event inside a project */
    createEvent: piece.tool("create_event"),
    /** Create Project: Create a posthog project */
    createProject: piece.tool("create_project"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
