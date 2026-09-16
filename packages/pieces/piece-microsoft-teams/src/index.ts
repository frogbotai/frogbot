import { createTeamsAdapter } from '@chat-adapter/teams';
import { definePiece, type PieceChannel, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { microsoftTeamsActionDefinitions } from './actions.js';
import { createMicrosoftTeamsClient } from './client.js';
import {
  microsoftTeamsAuth,
  microsoftTeamsClouds,
  microsoftTeamsEnvironment,
  microsoftTeamsOptions,
  microsoftTeamsScopes,
} from './config.js';
import { user } from './schemas.js';
import { microsoftTeamsTriggerDefinitions } from './triggers.js';
import { microsoftTeamsWebhook } from './webhook.js';

export const microsoftTeamsActions = [
  'createChannel',
  'sendChannelMessage',
  'sendChatMessage',
  'replyToChannelMessage',
  'createChatAndSendMessage',
  'createPrivateChannel',
  'getChatMessage',
  'deleteChatMessage',
  'getChannelMessage',
  'findChannel',
  'findTeamMember',
  'getMeetingTranscript',
  'getMeetingRecording',
  'customApiCall',
];
export const microsoftTeamsTriggers = [
  'channelMessageCreated',
  'channelCreated',
  'chatCreated',
  'chatMessageCreated',
  'messageReceived',
  'messageReactionReceived',
  'cardActionReceived',
  'conversationUpdated',
  'installationUpdated',
  'dialogOpened',
  'dialogSubmitted',
];
export { microsoftTeamsScopes };

export function defineMicrosoftTeams(environment?: z.input<typeof microsoftTeamsEnvironment>) {
  const settings = microsoftTeamsEnvironment.parse(environment ?? {});
  const cloud = microsoftTeamsClouds[settings.cloud];
  const tenant = encodeURIComponent(settings.tenantId);
  const environmentAuth = microsoftTeamsAuth.extend({
    cloud: z.literal(cloud.loginHost).default(cloud.loginHost),
    tenantId: z.literal(settings.tenantId).default(settings.tenantId),
  });
  const oauth = {
    authorizationUrl: `https://${cloud.loginHost}/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://${cloud.loginHost}/${tenant}/oauth2/v2.0/token`,
    scopes: microsoftTeamsScopes,
    params: { prompt: 'select_account' },
    toAuth: ({ tokens }) => ({
      accessToken: tokens.access_token ?? '',
      cloud: cloud.loginHost,
      tenantId: settings.tenantId,
    }),
    async account({ client }) {
      const account = await client.request('/v1.0/me', user);
      const email = account.mail ?? account.userPrincipalName;

      if (!email) throw new Error('Microsoft did not return an account email address.');

      return { id: account.id, label: account.displayName ?? email, email };
    },
  } satisfies PieceOAuthRecipe<
    z.output<typeof environmentAuth>,
    ReturnType<typeof createMicrosoftTeamsClient>
  >;
  const channel = {
    adapter({ auth, options }) {
      if (!auth.appId || !auth.appPassword) {
        throw new Error(
          'Microsoft Teams channels require Azure Bot appId and appPassword credentials.',
        );
      }

      if (options.botAppType === 'SingleTenant' && !options.botTenantId) {
        throw new Error('Single-tenant Microsoft Teams bots require a botTenantId option.');
      }

      return createTeamsAdapter({
        appId: auth.appId,
        appPassword: auth.appPassword,
        appType: options.botAppType,
        appTenantId: options.botTenantId,
        apiUrl: options.botApiUrl,
        userName: options.botUsername,
      });
    },
    async identity({ author, req }) {
      const email = z.email().safeParse(author.email?.trim().toLowerCase());

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
  } satisfies PieceChannel<
    z.output<typeof environmentAuth>,
    z.output<typeof microsoftTeamsOptions>,
    ReturnType<typeof createMicrosoftTeamsClient>
  >;

  return definePiece({
    slug: 'microsoft-teams',
    label: 'Microsoft Teams',
    admin: {
      description: 'Manage Teams channels, chats, messages, meetings, and bot activities',
      group: 'Communication',
    },
    auth: environmentAuth,
    options: microsoftTeamsOptions,
    client: createMicrosoftTeamsClient,
    oauth,
    webhook: microsoftTeamsWebhook,
    channel,
    actions: microsoftTeamsActionDefinitions,
    triggers: microsoftTeamsTriggerDefinitions,
  });
}

export const createMicrosoftTeams = defineMicrosoftTeams();
