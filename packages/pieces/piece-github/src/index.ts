import * as module from "@activepieces/piece-github";
import { createActivepiecesPiece } from "frogbot/pieces";

export const githubActions = [
  "github_create_issue",
  "getIssueInformation",
  "createCommentOnAIssue",
  "github_create_pull_request_review_comment",
  "add_labels_to_issue",
  "create_branch",
  "update_issue",
  "find_branch",
  "find_issue",
  "find_user",
] as const;
export const github = createActivepiecesPiece({
  module,
  service: "github",
  credentialType: "oauth2",
  defaultActions: githubActions,
});
