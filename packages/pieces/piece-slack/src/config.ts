import { z } from 'zod';

export const slackAuth = z.object({
  botToken: z.string().min(1).meta({ label: 'Bot token', secret: true }),
  userToken: z.string().min(1).optional().meta({ label: 'User token', secret: true }),
  teamId: z.string().min(1).optional().meta({ label: 'Workspace ID' }),
});

export const slackOptions = z.object({
  signingSecret: z.string().min(1).optional().meta({ label: 'Signing secret', secret: true }),
});

export const slackScopes = [
  'channels:history',
  'channels:join',
  'channels:manage',
  'channels:read',
  'channels:write.invites',
  'chat:write',
  'chat:write.customize',
  'conversations.connect:write',
  'emoji:read',
  'files:read',
  'files:write',
  'groups:history',
  'groups:read',
  'groups:write',
  'groups:write.invites',
  'im:history',
  'im:read',
  'im:write',
  'links:read',
  'links:write',
  'mpim:history',
  'mpim:read',
  'mpim:write',
  'reactions:read',
  'reactions:write',
  'usergroups:read',
  'usergroups:write',
  'users.profile:read',
  'users:read',
  'users:read.email',
];
