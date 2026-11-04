import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { customApiCall } from './actions/customApiCall.js';
import {
  listAssociations,
  listListMembers,
  listLists,
  listOwners,
  listPipelines,
  listProperties,
  listRecords,
} from './actions/reads.js';
import { createHubSpotClient, type HubSpotClient, HubSpotError, signal } from './client.js';
import { type HubSpotAuth, hubspotAuth } from './config.js';
import { owner } from './records.js';

export { HubSpotError } from './client.js';

const scope = <const T extends string>(...names: T[]) =>
  Object.fromEntries(names.map((name) => [name, name])) as { [K in T]: K };

/** HubSpot's own scope strings, each under its own name. */
export const hubspotScopes = scope(
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.tickets.read',
  'crm.objects.tickets.write',
  'crm.objects.line_items.read',
  'crm.objects.line_items.write',
  'crm.objects.custom.read',
  'crm.objects.custom.write',
  'crm.objects.owners.read',
  'crm.lists.read',
  'crm.lists.write',
  'crm.schemas.contacts.read',
  'crm.schemas.companies.read',
  'crm.schemas.deals.read',
  'crm.schemas.custom.read',
  'e-commerce',
  'sales-email-read',
  'files',
  'forms',
  'automation',
  'communication_preferences.read_write',
);

const tokenIdentity = z.object({ hub_id: z.number(), user_id: z.number() });

async function ownerEmail(client: HubSpotClient, userId: number, abort?: AbortSignal) {
  try {
    const found = await client.request(owner, {
      path: `/crm/v3/owners/${userId}`,
      query: { idProperty: 'userId' },
      signal: abort,
    });

    return found.email;
  } catch (error) {
    if (error instanceof HubSpotError && error.status === 404) return undefined;

    throw error;
  }
}

export const hubspotOAuth = {
  authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
  tokenUrl: 'https://api.hubapi.com/oauth/v3/token',
  scopes: {
    catalog: hubspotScopes,
    defaults: [
      'crm.objects.companies.read',
      'crm.objects.deals.read',
      'crm.objects.tickets.read',
      'crm.objects.owners.read',
      'crm.lists.read',
      'crm.schemas.contacts.read',
      'crm.schemas.companies.read',
      'crm.schemas.deals.read',
      'crm.schemas.custom.read',
    ],
    required: ['crm.objects.contacts.read'],
  },
  toAuth({ tokens }) {
    if (!tokens.access_token?.trim()) {
      throw new Error('HubSpot sign-in did not return an access token.');
    }

    return { accessToken: tokens.access_token };
  },
  async account({ tokens, client, req }) {
    const identity = tokenIdentity.safeParse(tokens);

    if (!identity.success) throw new Error('HubSpot sign-in did not name the user and portal.');

    const { hub_id: hubId, user_id: userId } = identity.data;
    const email = await ownerEmail(client, userId, signal(req));

    return {
      id: `${hubId}:${userId}`,
      label: email ? `${email} (portal ${hubId})` : `HubSpot portal ${hubId}`,
      ...(email ? { email } : {}),
    };
  },
} satisfies PieceOAuthRecipe<
  HubSpotAuth,
  HubSpotClient,
  PieceOAuthAccount,
  keyof typeof hubspotScopes
>;

export const createHubSpot = definePiece({
  slug: 'hubspot',
  label: 'HubSpot',
  admin: {
    description:
      'Import HubSpot contacts, companies, deals, tickets, activities, lists, owners and pipelines',
    group: 'Sales and CRM',
  },
  auth: hubspotAuth,
  oauth: hubspotOAuth,
  client: createHubSpotClient,
  actions: [
    listRecords,
    listAssociations,
    listLists,
    listListMembers,
    listOwners,
    listPipelines,
    listProperties,
    customApiCall,
  ],
});
