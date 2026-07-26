import * as module from '@activepieces/piece-linear';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const linearActions = ['linear_create_issue', 'linear_update_issue', 'linear_create_project', 'linear_create_comment'] as const;
export const linearScopes = [] as const;

export function createLinear(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "linear",
    credentialType: "secret_text",
    defaultActions: linearActions,
    scopes: linearScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Issue: Create a new issue in Linear workspace */
    linearCreateIssue: piece.tool("linear_create_issue"),
    /** Update Issue: Update a issue in Linear Workspace */
    linearUpdateIssue: piece.tool("linear_update_issue"),
    /** Create Project: Create a new project in Linear workspace */
    linearCreateProject: piece.tool("linear_create_project"),
    /** Update Project: Update a existing project in Linear workspace */
    linearUpdateProject: piece.tool("linear_update_project"),
    /** Create Comment: Create a new comment on an issue in Linear workspace */
    linearCreateComment: piece.tool("linear_create_comment"),
    /** Raw GraphQL query: Perform a raw GraphQL query */
    rawGraphqlQuery: piece.tool("rawGraphqlQuery"),
  });
}
