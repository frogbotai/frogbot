import { createSlackAdapter } from '@chat-adapter/slack';
import {
  definePiece,
  type PieceChannel,
  type PieceOAuthRecipe,
  type PieceWebhook,
} from 'frogbot/pieces';
import type { z } from 'zod';

import { slackActions } from './actions.js';
import { createSlackClient, type SlackClient } from './client.js';
import { slackAuth, slackOptions, slackScopes } from './config.js';
import { slackTriggers } from './triggers.js';
import { parseSlackWebhook, slackHandshake, verifySlackWebhook } from './webhook.js';

export const slackActionNames = slackActions.map((action) => action.slug);
export const slackTriggerNames = slackTriggers.map((trigger) => trigger.slug);
export { slackScopes };

function userToken(tokens: Record<string, unknown>) {
  const user = tokens.authed_user;

  return user &&
    typeof user === 'object' &&
    'access_token' in user &&
    typeof user.access_token === 'string'
    ? user.access_token
    : undefined;
}

function teamId(tokens: Record<string, unknown>) {
  const team = tokens.team;

  return team && typeof team === 'object' && 'id' in team && typeof team.id === 'string'
    ? team.id
    : undefined;
}

const slackAccount: NonNullable<
  PieceOAuthRecipe<z.output<typeof slackAuth>, SlackClient>['account']
> = async ({ client }) => {
  const account = await client.request('auth.test');
  const id = typeof account.team_id === 'string' ? account.team_id : '';
  const label = typeof account.team === 'string' ? account.team : id;

  if (!id) throw new Error('Slack auth.test did not return a workspace ID.');

  return { id, label };
};

const slackWebhook = {
  verify: verifySlackWebhook,
  async handshake({ req }) {
    return slackHandshake(req);
  },
  parse({ req }) {
    return parseSlackWebhook(req);
  },
} satisfies PieceWebhook<z.output<typeof slackOptions>>;

export const createSlack = definePiece({
  slug: 'slack',
  label: 'Slack',
  admin: {
    description: 'Manage Slack messages, files, channels, users, groups, and workspace events',
    group: 'Communication',
  },
  auth: slackAuth,
  options: slackOptions,
  client: createSlackClient,
  oauth: {
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: [...slackScopes],
    params: {
      user_scope:
        'search:read,users.profile:write,reactions:read,reactions:write,im:history,stars:read,channels:write,groups:write,im:write,mpim:write,channels:write.invites,groups:write.invites,channels:history,groups:history,chat:write,users:read,usergroups:write',
    },
    toAuth: ({ tokens }) => ({
      botToken: tokens.access_token ?? '',
      userToken: userToken(tokens),
      teamId: teamId(tokens),
    }),
    account: slackAccount,
  },
  webhook: slackWebhook,
  channel: {
    adapter({ auth, options }) {
      if (!options.signingSecret) {
        throw new Error('Slack channels require a signingSecret option for webhook verification.');
      }

      return createSlackAdapter({
        botToken: auth.botToken,
        signingSecret: options.signingSecret,
      });
    },
    async identity({ author, client, req }) {
      const response = await client.request('users.info', { user: author.userId });
      const user = response.user;
      const profile =
        user && typeof user === 'object' && 'profile' in user ? user.profile : undefined;
      const email =
        profile && typeof profile === 'object' && 'email' in profile ? profile.email : undefined;

      if (typeof email !== 'string' || !email.trim()) return null;

      const config = await req.frogbot.config;
      const payloadConfig = await config._internal.payloadConfig;
      const result = await req.frogbot.find({
        collection: payloadConfig.admin.user as never,
        where: { email: { equals: email.trim().toLowerCase() } },
        limit: 1,
        overrideAccess: true,
        req,
      });

      const match = result.docs[0];

      return match ? { ...match, collection: payloadConfig.admin.user } : null;
    },
  } satisfies PieceChannel<z.output<typeof slackAuth>, z.output<typeof slackOptions>, SlackClient>,
  actions: slackActions,
  triggers: slackTriggers,
});
