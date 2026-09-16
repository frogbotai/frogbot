# `@frogbotai/piece-github`

Manage GitHub issues, branches, comments, gists, custom API calls, and repository webhooks.

## Usage

```ts
import { createGithub } from '@frogbotai/piece-github';

export const github = createGithub({
  auth: {
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_PRIVATE_KEY!,
    installationId: Number(process.env.GITHUB_INSTALLATION_ID!),
  },
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  botUsername: process.env.GITHUB_BOT_USERNAME!,
});
```

Use the GitHub App credential for channel messages, repository webhook triggers, and actions that
should run as the bot. To let signed-in users run actions with their own identity, configure this
same piece as an OAuth or secret connection; FrogBot resolves that user credential before the
factory App credential for their calls.

Enable the credential form with `connections: [{ piece: github, secret: true }]`. Enter
`accessToken` for a personal access token, or all three App fields (`appId`, `privateKey`, and
`installationId`); omit the unused credential fields. OAuth linking requires factory
`oauth: { clientId, clientSecret }` and `connections: [{ piece: github, oauth: true }]`. Both linking
methods can be enabled on the same connection entry. Channels always use the factory App credential.

## GitHub App setup

1. Create a GitHub App and install it on the repository or organization FrogBot will use.
2. Set the webhook URL to `/api/webhooks/<piece-instance-slug>` and choose
   `application/json` as the content type.
3. Generate a private key and record the App ID, installation ID, webhook secret, bot username,
   and numeric bot user ID.
4. Grant read and write access to issues, pull requests, discussions, repository contents, and
   administration used by your enabled actions and webhook triggers. Grant metadata read access.
5. Subscribe to Issue comments and Pull request review comments for channel conversations. Add the
   repository events listed below only if they should also reach the channel webhook. Native
   triggers create and remove their own event-specific repository webhook.

FrogBot uses GitHub's issue, pull request, and review-comment thread identifiers directly through
the GitHub chat adapter. Issue and pull request conversations remain separate, and replies to one
review-comment thread continue in that thread. GitHub does not support direct messages, ephemeral
messages, typing indicators, or token-by-token streaming.

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
