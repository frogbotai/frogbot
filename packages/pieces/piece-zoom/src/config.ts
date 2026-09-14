import { z } from 'zod';

export const zoomAuth = z.object({
  accessToken: z.string().min(1).meta({ secret: true }),
  refreshToken: z.string().min(1).optional().meta({ secret: true }),
});

export const zoomScopes = [
  'meeting:write:meeting',
  'meeting:read:meeting',
  'meeting:read:list_meetings',
  'meeting:update:meeting',
  'meeting:write:registrant',
  'user:read:user',
];
