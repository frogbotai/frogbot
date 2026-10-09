import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';

import { xeroActions } from './actions.js';
import { createXeroClient, type XeroClient, xeroIdentity } from './client.js';
import { type XeroAuth, xeroAuth, xeroOptions, xeroScopes } from './config.js';
import { xeroTriggers } from './triggers.js';
import { xeroWebhook } from './webhook.js';

export { xeroScopes };
export const xeroActionNames = xeroActions.map(({ slug }) => slug);
export const xeroTriggerNames = xeroTriggers.map(({ slug }) => slug);

const xeroOAuth: PieceOAuthRecipe<
  XeroAuth,
  XeroClient,
  PieceOAuthAccount,
  keyof typeof xeroScopes
> = {
  authorizationUrl: 'https://login.xero.com/identity/connect/authorize',
  tokenUrl: 'https://identity.xero.com/connect/token',
  scopes: {
    catalog: xeroScopes,
    defaults: [
      'accounting.contacts',
      'accounting.transactions',
      'accounting.reports.read',
      'accounting.journals.read',
      'accounting.budgets.read',
      'accounting.attachments',
      'accounting.settings',
      'projects',
    ],
    required: ['openid', 'profile', 'email', 'offline_access'],
  },
  toAuth: ({ tokens }) => ({
    accessToken: tokens.access_token ?? '',
    refreshToken: tokens.refresh_token,
  }),
  async account({ client }) {
    const identity = await client.request(
      { base: 'identity', path: '/identity/connect/userinfo' },
      xeroIdentity,
    );

    return { id: identity.sub, label: identity.name ?? identity.email, email: identity.email };
  },
};

export const createXero = definePiece({
  slug: 'xero',
  label: 'Xero',
  admin: { description: 'Manage Xero accounting records and events', group: 'Accounting' },
  auth: xeroAuth,
  options: xeroOptions,
  client: createXeroClient,
  oauth: xeroOAuth,
  webhook: xeroWebhook,
  actions: xeroActions,
  triggers: xeroTriggers,
});

export { xeroActions } from './actions.js';
export { xeroTriggers } from './triggers.js';
