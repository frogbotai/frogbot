import * as module from "@activepieces/piece-github";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

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
export const githubScopes = [
  "admin:repo_hook",
  "admin:org",
  "repo",
  "gist"
] as const;

export function createGithub(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "github",
    credentialType: "oauth2",
    defaultActions: githubActions,
    scopes: githubScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Issue: Create Issue in GitHub Repository */
    githubCreateIssue: piece.tool("github_create_issue"),
    /** Get issue information: Grabs information from a specific issue */
    getIssueInformation: piece.tool("getIssueInformation"),
    /** Create comment on a issue: Adds a comment to the specified issue (also works with pull requests) */
    createCommentOnAIssue: piece.tool("createCommentOnAIssue"),
    /** Lock issue: Locks the specified issue */
    lockIssue: piece.tool("lockIssue"),
    /** Unlock issue: Unlocks the specified issue */
    unlockIssue: piece.tool("unlockIssue"),
    /** Raw GraphQL query: Perform a raw GraphQL query */
    rawGraphqlQuery: piece.tool("rawGraphqlQuery"),
    /** Create Pull Request Review Comment: Creates a review comment on a pull request in a GitHub repository */
    githubCreatePullRequestReviewComment: piece.tool("github_create_pull_request_review_comment"),
    /** Create Commit Comment: Creates a comment on a commit in a GitHub repository */
    githubCreateCommitComment: piece.tool("github_create_commit_comment"),
    /** Create Discussion Comment: Creates a comment on a discussion in a GitHub repository */
    githubCreateDiscussionComment: piece.tool("github_create_discussion_comment"),
    /** Add Labels to Issue: Adds labels to an existing issue. */
    addLabelsToIssue: piece.tool("add_labels_to_issue"),
    /** Create Branch: Creates a new branch on a repository. */
    createBranch: piece.tool("create_branch"),
    /** Delete Branch: Deletes a branch from a repository. */
    deleteBranch: piece.tool("delete_branch"),
    /** Update Issue: Updates an existing issue. */
    updateIssue: piece.tool("update_issue"),
    /** Find Branch: Finds a branch by name and returns its details. */
    findBranch: piece.tool("find_branch"),
    /** Find Issue: Finds an issue based title. */
    findIssue: piece.tool("find_issue"),
    /** Find User: Finds a user by their login name. */
    findUser: piece.tool("find_user"),
    /** Create Gist: Create a GitHub Gist. Requires an OAuth connection — Gists cannot be created with GitHub App authentication. */
    githubCreateGist: piece.tool("github_create_gist"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
