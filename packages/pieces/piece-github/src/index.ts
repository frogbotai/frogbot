import { createGitHubAdapter } from '@chat-adapter/github';
import {
  definePiece,
  type PieceChannel,
  type PieceOAuthRecipe,
  type PieceWebhook,
} from 'frogbot/pieces';
import { z } from 'zod';

import { githubActionDefinitions } from './actions.js';
import { createGithubClient, type GithubClient } from './client.js';
import { githubAuth, githubOptions, githubScopes } from './config.js';
import { githubTriggerDefinitions } from './triggers.js';
import { parseGithubWebhook, verifyGithubWebhook } from './webhook.js';

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

const githubWebhook = {
  verify: verifyGithubWebhook,
  parse({ req }) {
    return parseGithubWebhook(req);
  },
} satisfies PieceWebhook<z.output<typeof githubOptions>>;

const githubChannel = {
  adapter({ auth, options }) {
    if (!('appId' in auth)) {
      throw new Error('GitHub channels require GitHub App credentials.');
    }

    if (!options.webhookSecret) {
      throw new Error('GitHub channels require a webhookSecret option.');
    }

    return createGitHubAdapter({
      appId: auth.appId,
      privateKey: auth.privateKey,
      installationId: auth.installationId,
      webhookSecret: options.webhookSecret,
      userName: options.botUsername,
      botUserId: options.botUserId,
    });
  },
  async identity({ author, client, req }) {
    if (!author.userName) return null;

    const account = await client.request(
      `/users/${encodeURIComponent(author.userName)}`,
      z.looseObject({ email: z.string().nullable().optional() }),
    );
    const email = z.email().safeParse(account.email?.trim().toLowerCase());

    if (!email.success) return null;

    const config = await req.frogbot.config;
    const payloadConfig = await config._internal.payloadConfig;
    const result = await req.frogbot.find({
      collection: payloadConfig.admin.user as never,
      where: { email: { equals: email.data } },
      limit: 1,
      overrideAccess: true,
      req,
    });
    const match = result.docs[0];

    return match ? { ...match, collection: payloadConfig.admin.user } : null;
  },
} satisfies PieceChannel<z.output<typeof githubAuth>, z.output<typeof githubOptions>, GithubClient>;

export const createGithub = definePiece({
  slug: 'github',
  label: 'GitHub',
  admin: {
    description: 'Manage GitHub issues, branches, comments, gists, and repository events',
    group: 'Developer Tools',
  },
  auth: githubAuth,
  options: githubOptions,
  oauth: githubOAuth,
  client: createGithubClient,
  webhook: githubWebhook,
  channel: githubChannel,
  actions: githubActionDefinitions,
  triggers: githubTriggerDefinitions,
});

export { githubScopes } from './config.js';
