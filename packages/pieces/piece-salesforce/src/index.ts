import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';

import {
  createQueryJob,
  getQueryJob,
  getQueryJobResults,
  upsertRecordsBulk,
} from './actions/bulk.js';
import {
  addContactToCampaign,
  addLeadToCampaign,
  createCase,
  createContact,
  createLead,
  createNote,
  createOpportunity,
  createTask,
  deleteOpportunity,
  sendEmail,
  updateContact,
  updateLead,
} from './actions/crm.js';
import { customApiCall } from './actions/customApiCall.js';
import { createAttachment, listAttachments, uploadFile } from './actions/files.js';
import { describeObject, listObjects, query } from './actions/read.js';
import {
  createRecord,
  deleteRecord,
  getRecordByField,
  listChildRecords,
  searchRecords,
  updateRecord,
  upsertRecords,
} from './actions/records.js';
import { exportReport, runReport } from './actions/reports.js';
import { createSalesforceClient, type SalesforceClient, signal } from './client.js';
import {
  loginHost,
  type SalesforceAuth,
  salesforceAuth,
  type SalesforceSettings,
} from './config.js';

export { SalesforceError } from './client.js';
export type { SalesforceSettings } from './config.js';

/** Salesforce's OAuth scopes, each under its own name. */
export const salesforceScopes = {
  api: 'api',
  refresh_token: 'refresh_token',
  id: 'id',
  full: 'full',
} as const;

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The Salesforce piece for one login host: `login.salesforce.com` (the default),
 * `test.salesforce.com` for sandboxes, or a My Domain host. Define one per host, each with its
 * own `slug`, to connect production and a sandbox side by side.
 */
export function defineSalesforce(settings: SalesforceSettings = {}) {
  const host = loginHost.parse(settings.loginHost);

  const oauth = {
    authorizationUrl: `https://${host}/services/oauth2/authorize`,
    tokenUrl: `https://${host}/services/oauth2/token`,
    pkce: true,
    tokenLifetime: 15 * 60,
    scopes: {
      catalog: salesforceScopes,
      defaults: ['api'],
      required: ['refresh_token', 'id'],
    },
    toAuth({ tokens }) {
      const accessToken = text(tokens.access_token);
      const instanceUrl = text(tokens.instance_url);

      if (!accessToken || !instanceUrl) {
        throw new Error('Salesforce sign-in did not return an access token and instance URL.');
      }

      return { accessToken, instanceUrl, identityUrl: text(tokens.id) };
    },
    async account({ client, req }) {
      const user = await client.identity(signal(req));
      const name = text(user.display_name) ?? text(user.username) ?? user.user_id;
      const email = text(user.email);

      return {
        id: `${user.organization_id}:${user.user_id}`,
        label: email && email !== name ? `${name} (${email})` : name,
        ...(email ? { email } : {}),
      };
    },
  } satisfies PieceOAuthRecipe<
    SalesforceAuth,
    SalesforceClient,
    PieceOAuthAccount,
    keyof typeof salesforceScopes
  >;

  return definePiece({
    slug: 'salesforce',
    label: 'Salesforce',
    admin: {
      description:
        'Query, import, create and update Salesforce records, run reports, and react to record changes',
      group: 'Sales and CRM',
    },
    auth: salesforceAuth,
    client: ({ auth }) => createSalesforceClient({ auth }, host),
    oauth,
    actions: [
      query,
      listObjects,
      describeObject,
      createQueryJob,
      getQueryJob,
      getQueryJobResults,
      createRecord,
      updateRecord,
      deleteRecord,
      getRecordByField,
      searchRecords,
      listChildRecords,
      upsertRecords,
      upsertRecordsBulk,
      createCase,
      createContact,
      updateContact,
      createLead,
      updateLead,
      createNote,
      createOpportunity,
      deleteOpportunity,
      createTask,
      addContactToCampaign,
      addLeadToCampaign,
      sendEmail,
      uploadFile,
      createAttachment,
      listAttachments,
      runReport,
      exportReport,
      customApiCall,
    ],
  });
}

export const createSalesforce = defineSalesforce();
