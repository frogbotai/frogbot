import { definePiece, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { microsoftTeamsActionDefinitions } from './actions.js';
import { createMicrosoftTeamsClient } from './client.js';
import { microsoftTeamsClouds, microsoftTeamsEnvironment, microsoftTeamsScopes } from './config.js';
import { user } from './schemas.js';
import { microsoftTeamsTriggerDefinitions } from './triggers.js';

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
];
export { microsoftTeamsScopes };

export function defineMicrosoftTeams(environment?: z.input<typeof microsoftTeamsEnvironment>) {
  const settings = microsoftTeamsEnvironment.parse(environment ?? {});
  const cloud = microsoftTeamsClouds[settings.cloud];
  const tenant = encodeURIComponent(settings.tenantId);
  const environmentAuth = z.object({
    accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
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

  return definePiece({
    slug: 'microsoft-teams',
    label: 'Microsoft Teams',
    admin: {
      description: 'Manage Teams channels, chats, messages, meetings, and polling events',
      group: 'Communication',
    },
    auth: environmentAuth,
    client: createMicrosoftTeamsClient,
    oauth,
    actions: microsoftTeamsActionDefinitions,
    triggers: microsoftTeamsTriggerDefinitions,
  });
}

export const createMicrosoftTeams = defineMicrosoftTeams();
