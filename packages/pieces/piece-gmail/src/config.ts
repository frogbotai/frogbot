import { z } from 'zod';

export const gmailAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().optional().meta({ label: 'Refresh token', secret: true }),
});
export const gmailScopes = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'email',
] as const;
