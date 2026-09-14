import { z } from 'zod';

export const microsoftTeamsAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  cloud: z
    .enum(['login.microsoftonline.com', 'login.microsoftonline.us'])
    .default('login.microsoftonline.com')
    .meta({ label: 'Cloud environment' }),
  tenantId: z.string().trim().min(1).default('common').meta({ label: 'Tenant ID' }),
});
export const microsoftTeamsEnvironment = z.object({
  cloud: z.enum(['commercial', 'usGovernment']).default('commercial'),
  tenantId: z.string().trim().min(1).default('common'),
});

export const microsoftTeamsClouds = {
  commercial: {
    loginHost: 'login.microsoftonline.com',
    graphUrl: 'https://graph.microsoft.com',
  },
  usGovernment: {
    loginHost: 'login.microsoftonline.us',
    graphUrl: 'https://graph.microsoft.us',
  },
};

export const microsoftTeamsScopes = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Channel.Create',
  'Channel.ReadBasic.All',
  'ChannelMessage.Send',
  'Team.ReadBasic.All',
  'Chat.ReadWrite',
  'ChannelMessage.Read.All',
  'TeamMember.Read.All',
  'User.ReadBasic.All',
  'Presence.Read.All',
  'OnlineMeetingTranscript.Read.All',
  'OnlineMeetingRecording.Read.All',
];

export const identifier = z.string().trim().min(1);
export const contentType = z.enum(['text', 'html']).default('text');
export const meetingIdentifierType = z
  .enum(['meetingId', 'joinWebUrl', 'joinMeetingId'])
  .default('meetingId');
