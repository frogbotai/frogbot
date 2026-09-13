import { z } from 'zod';

export const googleSheetsAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().optional().meta({ label: 'Refresh token', secret: true }),
});

export const googleSheetsScopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive',
] as const;
