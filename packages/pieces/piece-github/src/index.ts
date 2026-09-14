import { definePiece, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { githubActionDefinitions } from './actions.js';
import { createGithubClient, type GithubClient } from './client.js';
import { githubAuth, githubScopes } from './config.js';
import { githubTriggerDefinitions } from './triggers.js';

export const githubActions = [
  'createIssue',
  'getIssue',
  'createIssueComment',
  'lockIssue',
  'unlockIssue',
  'rawGraphqlQuery',
  'createPullRequestReviewComment',
  'createCommitComment',
  'createDiscussionComment',
  'addIssueLabels',
  'createBranch',
  'deleteBranch',
  'updateIssue',
  'findBranch',
  'findIssue',
  'findUser',
  'createGist',
  'customApiCall',
];

export const githubTriggers = [
  'pullRequestActivity',
  'starActivity',
  'issueActivity',
  'push',
  'discussionActivity',
  'discussionCommentActivity',
  'branchCreated',
  'collaboratorAdded',
  'labelCreated',
  'milestoneCreated',
  'releaseCreated',
  'commitCreated',
  'reviewRequested',
  'mentioned',
];

export const githubOAuth = {
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: [...githubScopes],
  toAuth({ tokens }) {
    if (!tokens.access_token?.trim()) {
      throw new Error('GitHub OAuth did not return an access token.');
    }

    return { accessToken: tokens.access_token };
  },
  async account({ client }) {
    const user = await client.request(
      '/user',
      z.looseObject({
        id: z.number().int(),
        login: z.string().min(1),
        name: z.string().nullable().optional(),
      }),
    );
    const emails = await client.request(
      '/user/emails',
      z.array(z.looseObject({ email: z.email(), primary: z.boolean(), verified: z.boolean() })),
    );
    const email = emails.find((value) => value.primary && value.verified)?.email;

    if (!email) throw new Error('GitHub did not return a verified primary email address.');

    return { id: String(user.id), label: user.name?.trim() || user.login, email };
  },
} satisfies PieceOAuthRecipe<z.output<typeof githubAuth>, GithubClient>;

export const createGithub = definePiece({
  slug: 'github',
  label: 'GitHub',
  admin: {
    description: 'Manage GitHub issues, branches, comments, gists, and repository events',
    group: 'Developer Tools',
  },
  auth: githubAuth,
  oauth: githubOAuth,
  client: createGithubClient,
  actions: githubActionDefinitions,
  triggers: githubTriggerDefinitions,
});

export { githubScopes } from './config.js';
