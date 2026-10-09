import { z } from 'zod';

export const zoomAuth = z.object({
  accessToken: z.string().min(1).meta({ secret: true }),
  refreshToken: z.string().min(1).optional().meta({ secret: true }),
});

export const zoomScopes = {
  'meeting:write:meeting': 'meeting:write:meeting',
  'meeting:read:meeting': 'meeting:read:meeting',
  'meeting:read:list_meetings': 'meeting:read:list_meetings',
  'meeting:update:meeting': 'meeting:update:meeting',
  'meeting:delete:meeting': 'meeting:delete:meeting',
  'meeting:write:registrant': 'meeting:write:registrant',
  'meeting:read:registrant': 'meeting:read:registrant',
  'meeting:read:list_registrants': 'meeting:read:list_registrants',
  'meeting:read:past_meeting': 'meeting:read:past_meeting',
  'meeting:read:list_past_participants': 'meeting:read:list_past_participants',
  'user:read:user': 'user:read:user',
  'user:read:email': 'user:read:email',
  'user:read:settings': 'user:read:settings',
} as const;
