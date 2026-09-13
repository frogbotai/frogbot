import { googleOAuth } from '@frogbotai/piece-google';
import { definePiece } from 'frogbot/pieces';

import { customApiCall } from './actions/customApiCall.js';
import { getEmail } from './actions/getEmail.js';
import { createDraftReply, replyToEmail } from './actions/replyToEmail.js';
import { searchEmails } from './actions/searchEmails.js';
import { send } from './actions/send.js';
import { createGmailClient } from './client.js';
import { gmailAuth, gmailScopes } from './config.js';
import { newEmail } from './triggers/newEmail.js';

export const gmailActions = [
  'send',
  'replyToEmail',
  'createDraftReply',
  'getEmail',
  'searchEmails',
  'customApiCall',
] as const;
export const gmailTriggers = ['newEmail'] as const;
export { gmailScopes };

export const createGmail = definePiece({
  slug: 'gmail',
  label: 'Gmail',
  admin: { description: 'Send, draft, read, and search Gmail messages', group: 'Communication' },
  auth: gmailAuth,
  client: createGmailClient,
  oauth: {
    ...googleOAuth,
    scopes: [...googleOAuth.scopes, ...gmailScopes],
    toAuth: ({ tokens }) => ({
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token,
    }),
  },
  actions: [send, replyToEmail, createDraftReply, getEmail, searchEmails, customApiCall],
  triggers: [newEmail],
});
