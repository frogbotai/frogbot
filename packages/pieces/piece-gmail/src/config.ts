import { z } from 'zod';

export const gmailAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().optional().meta({ label: 'Refresh token', secret: true }),
});
export const gmailScopes = {
  'mail.google.com': 'https://mail.google.com/',
  'gmail.modify': 'https://www.googleapis.com/auth/gmail.modify',
  'gmail.readonly': 'https://www.googleapis.com/auth/gmail.readonly',
  'gmail.compose': 'https://www.googleapis.com/auth/gmail.compose',
  'gmail.send': 'https://www.googleapis.com/auth/gmail.send',
  'gmail.insert': 'https://www.googleapis.com/auth/gmail.insert',
  'gmail.labels': 'https://www.googleapis.com/auth/gmail.labels',
  'gmail.metadata': 'https://www.googleapis.com/auth/gmail.metadata',
  'gmail.settings.basic': 'https://www.googleapis.com/auth/gmail.settings.basic',
  'gmail.settings.sharing': 'https://www.googleapis.com/auth/gmail.settings.sharing',
} as const;
