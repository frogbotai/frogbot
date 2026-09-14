# `@frogbotai/piece-github`

Manage GitHub issues, branches, comments, gists, custom API calls, and repository webhooks.

## Usage

```ts
import { createGithub } from '@frogbotai/piece-github';

export const github = createGithub({
  oauth: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
});
```

## Actions

| Upstream action slug                        | Previous wrapper export                | Native action                    | Notes                                                              |
| ------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `github_create_issue`                       | `githubCreateIssue`                    | `createIssue`                    |                                                                    |
| `getIssueInformation`                       | `getIssueInformation`                  | `getIssue`                       |                                                                    |
| `createCommentOnAIssue`                     | `createCommentOnAIssue`                | `createIssueComment`             |                                                                    |
| `lockIssue`                                 | `lockIssue`                            | `lockIssue`                      |                                                                    |
| `unlockIssue`                               | `unlockIssue`                          | `unlockIssue`                    |                                                                    |
| `rawGraphqlQuery`                           | `rawGraphqlQuery`                      | `rawGraphqlQuery`                | Fixed GitHub GraphQL endpoint.                                     |
| `github_create_pull_request_review_comment` | `githubCreatePullRequestReviewComment` | `createPullRequestReviewComment` |                                                                    |
| `github_create_commit_comment`              | `githubCreateCommitComment`            | `createCommitComment`            |                                                                    |
| `github_create_discussion_comment`          | `githubCreateDiscussionComment`        | `createDiscussionComment`        |                                                                    |
| `add_labels_to_issue`                       | `addLabelsToIssue`                     | `addIssueLabels`                 |                                                                    |
| `create_branch`                             | `createBranch`                         | `createBranch`                   |                                                                    |
| `delete_branch`                             | `deleteBranch`                         | `deleteBranch`                   |                                                                    |
| `update_issue`                              | `updateIssue`                          | `updateIssue`                    |                                                                    |
| `find_branch`                               | `findBranch`                           | `findBranch`                     |                                                                    |
| `find_issue`                                | `findIssue`                            | `findIssue`                      |                                                                    |
| `find_user`                                 | `findUser`                             | `findUser`                       |                                                                    |
| `github_create_gist`                        | `githubCreateGist`                     | `createGist`                     |                                                                    |
| `custom_api_call`                           | `customApiCall`                        | `customApiCall`                  | GitHub API origin only; auth overrides and redirects are rejected. |

## Triggers

| Upstream trigger slug        | Native trigger              | Type      | Notes                                                                 |
| ---------------------------- | --------------------------- | --------- | --------------------------------------------------------------------- |
| `trigger_pull_request`       | `pullRequestActivity`       | `webhook` |                                                                       |
| `trigger_star`               | `starActivity`              | `webhook` |                                                                       |
| `trigger_issues`             | `issueActivity`             | `webhook` |                                                                       |
| `trigger_push`               | `push`                      | `webhook` |                                                                       |
| `trigger_discussion`         | `discussionActivity`        | `webhook` |                                                                       |
| `trigger_discussion_comment` | `discussionCommentActivity` | `webhook` |                                                                       |
| `new_branch`                 | `branchCreated`             | `webhook` | Filters branch creation events.                                       |
| `new_collaborator`           | `collaboratorAdded`         | `webhook` | Filters the `added` action.                                           |
| `new_label`                  | `labelCreated`              | `webhook` | Filters the `created` action.                                         |
| `new_milestone`              | `milestoneCreated`          | `webhook` | Filters the `created` action.                                         |
| `new_release`                | `releaseCreated`            | `webhook` | Filters the `created` action.                                         |
| `new_commit`                 | `commitCreated`             | `webhook` | Emits distinct commits pushed to branches.                            |
| `new_review_request`         | `reviewRequested`           | `webhook` | Filters the `review_requested` action.                                |
| `new_mention`                | `mentioned`                 | `webhook` | Filters issue and review comments mentioning the authenticated login. |
