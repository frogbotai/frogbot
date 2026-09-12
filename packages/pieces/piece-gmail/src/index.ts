import { definePiece } from 'frogbot/pieces';

import { customApiCall } from './actions/customApiCall.js';
import { getEmail } from './actions/getEmail.js';
import { createDraftReply, replyToEmail } from './actions/replyToEmail.js';
import { searchEmails } from './actions/searchEmails.js';
import { send } from './actions/send.js';
import { createGmailClient, type Gmail } from './client.js';
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
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [...gmailScopes],
    params: { access_type: 'offline', prompt: 'consent' },
    toAuth: ({ tokens }) => ({
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token,
    }),
    async account({ client }) {
      const profile = (await (client as Gmail).users.getProfile({ userId: 'me' })).data;
      return {
        id: profile.emailAddress ?? 'me',
        label: profile.emailAddress ?? 'Gmail account',
        email: profile.emailAddress ?? undefined,
      };
    },
  },
  actions: [send, replyToEmail, createDraftReply, getEmail, searchEmails, customApiCall],
  triggers: [newEmail],
});
