import {
  microsoftClouds,
  type MicrosoftEnvironment,
  microsoftEnvironment,
  microsoftOAuth,
} from '@frogbotai/piece-microsoft';
import { definePiece } from 'frogbot/pieces';
import { z } from 'zod';

import { addCategory, removeCategory } from './actions/categories.js';
import { createDraftEmail } from './actions/createDraftEmail.js';
import { createEvent } from './actions/createEvent.js';
import { customApiCall } from './actions/customApiCall.js';
import { deleteEvent } from './actions/deleteEvent.js';
import { downloadAttachment } from './actions/downloadAttachment.js';
import { findFreeBusyPeriods } from './actions/findFreeBusyPeriods.js';
import { forwardEmail } from './actions/forwardEmail.js';
import { listCalendars } from './actions/listCalendars.js';
import { listContacts } from './actions/listContacts.js';
import { listEmails } from './actions/listEmails.js';
import { listEvents } from './actions/listEvents.js';
import { listMailFolders } from './actions/listMailFolders.js';
import { moveEmail } from './actions/moveEmail.js';
import { replyToEmail } from './actions/replyToEmail.js';
import { searchEmails } from './actions/searchEmails.js';
import { sendDraft } from './actions/sendDraft.js';
import { sendEmail } from './actions/sendEmail.js';
import { type AppTokenCache, createMicrosoftOutlookClient } from './client.js';
import { microsoftOutlookAuth, microsoftOutlookScopes } from './config.js';
import { newAttachment } from './triggers/newAttachment.js';
import { newEmail } from './triggers/newEmail.js';
import { newEmailInFolder } from './triggers/newEmailInFolder.js';

export const microsoftOutlookActions = [
  'sendEmail',
  'replyToEmail',
  'forwardEmail',
  'createDraftEmail',
  'sendDraft',
  'moveEmail',
  'addCategory',
  'removeCategory',
  'searchEmails',
  'downloadAttachment',
  'createEvent',
  'deleteEvent',
  'listCalendars',
  'findFreeBusyPeriods',
  'listMailFolders',
  'listEmails',
  'listEvents',
  'listContacts',
  'customApiCall',
] as const;
export const microsoftOutlookTriggers = ['newEmail', 'newEmailInFolder', 'newAttachment'] as const;
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
    actions: [
      sendEmail,
      replyToEmail,
      forwardEmail,
      createDraftEmail,
      sendDraft,
      moveEmail,
      addCategory,
      removeCategory,
      searchEmails,
      downloadAttachment,
      createEvent,
      deleteEvent,
      listCalendars,
      findFreeBusyPeriods,
      listMailFolders,
      listEmails,
      listEvents,
      listContacts,
      customApiCall,
    ],
    triggers: [newEmail, newEmailInFolder, newAttachment],
  });
}

export const createMicrosoftOutlook = defineMicrosoftOutlook();
