# `@frogbotai/piece-jira`

Create, search, update and comment on Jira Cloud issues, and attach files, with an Atlassian API token or Atlassian sign-in.

## Usage

```ts
import { createJira } from '@frogbotai/piece-jira';

// An app-wide API token.
export const jira = createJira({
  siteUrl: 'https://acme.atlassian.net',
  auth: { email: process.env.JIRA_EMAIL!, apiToken: process.env.JIRA_API_TOKEN! },
});

// Or each person signs in with Atlassian.
export const jiraForUsers = createJira({
  siteUrl: 'https://acme.atlassian.net',
  oauth: {
    clientId: process.env.ATLASSIAN_CLIENT_ID!,
    clientSecret: process.env.ATLASSIAN_CLIENT_SECRET!,
  },
});
```

`siteUrl` must be `https://<name>.atlassian.net`. API tokens need it. Atlassian sign-in uses it to pick the site when an account reaches several.

Rich-text inputs (descriptions, comments, transition comments) take markdown or an ADF document. Reads return Jira's stored ADF.

## Actions

| Upstream action slug   | Native action     | Notes                                                                   |
| ---------------------- | ----------------- | ----------------------------------------------------------------------- |
| `create_issue`         | `createIssue`     | Common fields are inputs; other fields go in `fields` by Jira field id. |
| `update_issue`         | `updateIssue`     | Same fields; `transitionId` runs first.                                 |
| `get_issue`            | `getIssue`        |                                                                         |
| `search_issues`        | `searchIssues`    |                                                                         |
| `assign_issue`         | `assignIssue`     |                                                                         |
| `transition_issue`     | `transitionIssue` | Takes an optional comment.                                              |
| `find-user`            | `findUser`        |                                                                         |
| `add_issue_comment`    | `addComment`      | Markdown or ADF, with no `isADF` flag.                                  |
| `update_issue_comment` | `updateComment`   | Markdown or ADF.                                                        |
| `delete_issue_comment` | `deleteComment`   |                                                                         |
| `list_issue_comments`  | `listComments`    |                                                                         |
| `add_issue_attachment` | `addAttachment`   | Takes a FrogBot file.                                                   |
| `get-issue-attachment` | `getAttachment`   | Metadata only.                                                          |
| `add-watcher-to-issue` | `addWatcher`      | Throws on failure instead of returning `success: false`.                |
| `link-issues`          | `linkIssues`      |                                                                         |
| `markdownToJiraFormat` | `markdownToAdf`   | Built in, without `@atlaskit`; tables stay text.                        |
| custom API call        | `customApiCall`   | Paths under `/rest/api/3` or `/rest/agile/1.0`.                         |

Issue actions take an issue key or id. Their pickers list the 100 most recently updated issues, so there is no project input just for the picker.
