import { z } from 'zod';

export const microsoftTeamsAuth = z.object({
  accessToken: z.string().min(1).optional().meta({ label: 'Graph access token', secret: true }),
  appId: z.string().min(1).optional().meta({ label: 'Azure Bot App ID' }),
  appPassword: z.string().min(1).optional().meta({ label: 'Azure Bot App password', secret: true }),
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

export const microsoftTeamsOptions = z.object({
  botAppType: z.enum(['MultiTenant', 'SingleTenant']).default('MultiTenant'),
  botTenantId: z.string().trim().min(1).optional(),
  botApiUrl: z.url().optional(),
  botUsername: z.string().trim().min(1).default('bot'),
});

export type MicrosoftTeamsOptions = z.output<typeof microsoftTeamsOptions>;

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

export const microsoftTeamsScopes = {
  openid: 'openid',
  email: 'email',
  profile: 'profile',
  offline_access: 'offline_access',
  'User.Read': 'User.Read',
  'Channel.Create': 'Channel.Create',
  'Channel.ReadBasic.All': 'Channel.ReadBasic.All',
  'ChannelMessage.Send': 'ChannelMessage.Send',
  'Team.ReadBasic.All': 'Team.ReadBasic.All',
  'Chat.ReadWrite': 'Chat.ReadWrite',
  'ChannelMessage.Read.All': 'ChannelMessage.Read.All',
  'TeamMember.Read.All': 'TeamMember.Read.All',
  'User.ReadBasic.All': 'User.ReadBasic.All',
  'Presence.Read.All': 'Presence.Read.All',
  'OnlineMeetingTranscript.Read.All': 'OnlineMeetingTranscript.Read.All',
  'OnlineMeetingRecording.Read.All': 'OnlineMeetingRecording.Read.All',
  'User.Read.All': 'User.Read.All',
  'Team.Create': 'Team.Create',
  'TeamSettings.Read.All': 'TeamSettings.Read.All',
  'TeamSettings.ReadWrite.All': 'TeamSettings.ReadWrite.All',
  'Channel.Delete.All': 'Channel.Delete.All',
  'ChannelSettings.Read.All': 'ChannelSettings.Read.All',
  'ChannelSettings.ReadWrite.All': 'ChannelSettings.ReadWrite.All',
  'ChannelMember.Read.All': 'ChannelMember.Read.All',
  'ChannelMember.ReadWrite.All': 'ChannelMember.ReadWrite.All',
  'ChannelMessage.ReadWrite': 'ChannelMessage.ReadWrite',
  'ChannelMessage.Edit': 'ChannelMessage.Edit',
  'Chat.Create': 'Chat.Create',
  'Chat.Read': 'Chat.Read',
  'Chat.ReadBasic': 'Chat.ReadBasic',
  'ChatMessage.Send': 'ChatMessage.Send',
  'ChatMessage.Read': 'ChatMessage.Read',
  'ChatMember.Read': 'ChatMember.Read',
  'ChatMember.ReadWrite': 'ChatMember.ReadWrite',
  'TeamMember.ReadWrite.All': 'TeamMember.ReadWrite.All',
  'Presence.Read': 'Presence.Read',
  'OnlineMeetings.Read': 'OnlineMeetings.Read',
  'OnlineMeetings.ReadWrite': 'OnlineMeetings.ReadWrite',
} as const;

export const identifier = z.string().trim().min(1);
export const contentType = z.enum(['text', 'html']).default('text');
export const meetingIdentifierType = z
  .enum(['meetingId', 'joinWebUrl', 'joinMeetingId'])
  .default('meetingId');
