import { microsoftScopes } from '@frogbotai/piece-microsoft';
import { z } from 'zod';

/**
 * A linked account fills `accessToken`; a company mailbox signed in with the app's own secret
 * fills `clientId`, `clientSecret` and `mailbox`.
 */
export const microsoftOutlookAuth = z.object({
  accessToken: z.string().min(1).optional().meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().optional().meta({ label: 'Refresh token', secret: true }),
  clientId: z.string().trim().min(1).optional().meta({ label: 'App client ID' }),
  clientSecret: z.string().min(1).optional().meta({ label: 'App client secret', secret: true }),
  mailbox: z
    .string()
    .trim()
    .min(1)
    .optional()
    .meta({ label: 'Mailbox', description: 'The mailbox the app reads, such as sales@acme.com.' }),
  cloud: z
    .enum(['login.microsoftonline.com', 'login.microsoftonline.us'])
    .default('login.microsoftonline.com')
    .meta({ label: 'Cloud environment' }),
  tenantId: z.string().trim().min(1).default('common').meta({ label: 'Tenant ID' }),
});

export type MicrosoftOutlookAuth = z.output<typeof microsoftOutlookAuth>;

export const microsoftOutlookScopes = {
  ...microsoftScopes,
  'Mail.Read': 'Mail.Read',
  'Mail.ReadWrite': 'Mail.ReadWrite',
  'Mail.Send': 'Mail.Send',
  'Calendars.Read': 'Calendars.Read',
  'Calendars.ReadWrite': 'Calendars.ReadWrite',
  'Contacts.Read': 'Contacts.Read',
} as const;
