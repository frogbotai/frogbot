import {
  microsoftClouds,
  type MicrosoftEnvironment,
  microsoftEnvironment,
  microsoftOAuth,
} from '@frogbotai/piece-microsoft';
import { definePiece } from 'frogbot/pieces';
import { z } from 'zod';

import { customApiCall } from './actions/customApiCall.js';
import { type AppTokenCache, createMicrosoftOutlookClient } from './client.js';
import { microsoftOutlookAuth, microsoftOutlookScopes } from './config.js';

export const microsoftOutlookActions = ['customApiCall'] as const;
export { microsoftOutlookScopes };
export { MicrosoftGraphError } from './client.js';

export function defineMicrosoftOutlook(environment?: MicrosoftEnvironment) {
  const settings = microsoftEnvironment.parse(environment ?? {});
  const cloud = microsoftClouds[settings.cloud];
  const recipe = microsoftOAuth(settings);
  const tokens: AppTokenCache = new Map();
  const environmentAuth = microsoftOutlookAuth.extend({
    cloud: z.literal(cloud.loginHost).default(cloud.loginHost),
    tenantId: z.string().trim().min(1).default(settings.tenantId).meta({ label: 'Tenant ID' }),
  });

  return definePiece({
    slug: 'microsoft-outlook',
    label: 'Microsoft Outlook',
    admin: {
      description: 'Send, file and search Outlook mail, and manage calendar events',
      group: 'Communication',
    },
    auth: environmentAuth,
    client: ({ auth }: { auth: unknown }) => createMicrosoftOutlookClient(auth, tokens),
    oauth: {
      ...recipe,
      scopes: {
        catalog: microsoftOutlookScopes,
        defaults: ['Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'Contacts.Read'],
        required: ['offline_access', 'User.Read', 'openid', 'email', 'profile'],
      },
      toAuth: ({ tokens }) => ({
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token,
        cloud: cloud.loginHost,
        tenantId: settings.tenantId,
      }),
    },
    actions: [customApiCall],
  });
}

export const createMicrosoftOutlook = defineMicrosoftOutlook();
