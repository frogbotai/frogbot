import { z } from 'zod';

export const xeroAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().min(1).optional().meta({ label: 'Refresh token', secret: true }),
});
export type XeroAuth = z.output<typeof xeroAuth>;

export const xeroOptions = z.object({
  webhookKey: z.string().min(1).optional().meta({ label: 'Webhook key', secret: true }),
});
export type XeroOptions = z.output<typeof xeroOptions>;

export const xeroScopes = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.contacts',
  'accounting.transactions',
  'accounting.reports.read',
  'accounting.journals.read',
  'accounting.budgets.read',
  'accounting.attachments',
  'accounting.settings',
  'projects',
];
