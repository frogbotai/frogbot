import { z } from 'zod';

export const googleSheetsAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().optional().meta({ label: 'Refresh token', secret: true }),
});

export const googleSheetsScopes = {
  spreadsheets: 'https://www.googleapis.com/auth/spreadsheets',
  'spreadsheets.readonly': 'https://www.googleapis.com/auth/spreadsheets.readonly',
  drive: 'https://www.googleapis.com/auth/drive',
  'drive.file': 'https://www.googleapis.com/auth/drive.file',
  'drive.readonly': 'https://www.googleapis.com/auth/drive.readonly',
} as const;
