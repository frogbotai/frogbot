import { definePiece, type PieceDefinition } from 'frogbot/pieces';

import { cancelScheduledEmail } from './actions/cancelScheduledEmail.js';
import { createAudience } from './actions/createAudience.js';
import { createBroadcast } from './actions/createBroadcast.js';
import { createContact } from './actions/createContact.js';
import { createDomain } from './actions/createDomain.js';
import { customApiCall } from './actions/customApiCall.js';
import { deleteAudience } from './actions/deleteAudience.js';
import { deleteBroadcast } from './actions/deleteBroadcast.js';
import { deleteContact } from './actions/deleteContact.js';
import { deleteDomain } from './actions/deleteDomain.js';
import { getEmailStatus } from './actions/getEmailStatus.js';
import { listAudiences } from './actions/listAudiences.js';
import { listBroadcasts } from './actions/listBroadcasts.js';
import { listContacts } from './actions/listContacts.js';
import { listDomains } from './actions/listDomains.js';
import { listEmails } from './actions/listEmails.js';
import { rescheduleEmail } from './actions/rescheduleEmail.js';
import { send } from './actions/send.js';
import { sendBatchEmails } from './actions/sendBatchEmails.js';
import { sendBroadcast } from './actions/sendBroadcast.js';
import { updateContact } from './actions/updateContact.js';
import { verifyDomain } from './actions/verifyDomain.js';
import { createResendClient, type ResendClient } from './client.js';
import { resendAuth, resendOptions } from './config.js';
import { resendEmail } from './email.js';
import type { ResendTypes } from './piece-types.js';

export const resendActions = [
  'send',
  'sendBatchEmails',
  'getEmailStatus',
  'listEmails',
  'cancelScheduledEmail',
  'rescheduleEmail',
  'createContact',
  'updateContact',
  'deleteContact',
  'listContacts',
  'listDomains',
  'createDomain',
  'deleteDomain',
  'verifyDomain',
  'listAudiences',
  'createAudience',
  'deleteAudience',
  'listBroadcasts',
  'createBroadcast',
  'sendBroadcast',
  'deleteBroadcast',
  'customApiCall',
] as const;

export const resendScopes = [] as const;

export const createResend = definePiece({
  slug: 'resend',
  label: 'Resend',
  admin: { description: 'Send email and manage Resend resources', group: 'Communication' },
  auth: resendAuth,
  options: resendOptions,
  client: ({ auth }) => createResendClient(auth),
  actions: [
    send,
    sendBatchEmails,
    getEmailStatus,
    listEmails,
    cancelScheduledEmail,
    rescheduleEmail,
    createContact,
    updateContact,
    deleteContact,
    listContacts,
    listDomains,
    createDomain,
    deleteDomain,
    verifyDomain,
    listAudiences,
    createAudience,
    deleteAudience,
    listBroadcasts,
    createBroadcast,
    sendBroadcast,
    deleteBroadcast,
    customApiCall,
  ],
  email: resendEmail,
} satisfies PieceDefinition<ResendTypes, ResendClient>);
