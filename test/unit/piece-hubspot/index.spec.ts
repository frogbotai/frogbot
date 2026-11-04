import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { oauthScopes } from '../../../packages/frogbot/src/connections/oauth/scopes.js';
import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createHubSpot, hubspotScopes } from '../../../packages/pieces/piece-hubspot/src/index.js';
import { calls, json, path, query, req, stubHubSpot } from './fixtures.js';

const app = { clientId: 'client', clientSecret: 'secret' };
const definition = pieceFactoryDefinition(createHubSpot);

afterEach(() => vi.unstubAllGlobals());

describe('HubSpot piece', () => {
  it('is the HubSpot piece in Sales and CRM', () => {
    expect(definition).toMatchObject({
      slug: 'hubspot',
      label: 'HubSpot',
      admin: { group: 'Sales and CRM' },
    });
  });

  it('marks every import read idempotent', () => {
    const reads = definition.actions.filter((action) => action.slug.startsWith('list'));

    expect(reads.map((action) => action.slug)).toEqual([
      'listRecords',
      'listAssociations',
      'listLists',
      'listListMembers',
      'listOwners',
      'listPipelines',
      'listProperties',
    ]);
    expect(reads.every((action) => action.idempotent === true)).toBe(true);
  });

  it('marks the access token secret', () => {
    const shape = z.toJSONSchema(definition.auth!, { io: 'input' }).properties;

    expect(shape?.accessToken).toMatchObject({ secret: true });
  });
});

describe('HubSpot OAuth', () => {
  it('signs in at HubSpot and exchanges the code at the v3 token endpoint, in the form body', () => {
    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
      tokenUrl: 'https://api.hubapi.com/oauth/v3/token',
      scopes: { catalog: hubspotScopes },
    });
    expect(definition.oauth).not.toHaveProperty('tokenEndpointAuthMethod');
    expect(definition.oauth).not.toHaveProperty('pkce');
  });

  it('asks for the import read scopes by default, and always for contacts', () => {
    expect(oauthScopes(createHubSpot({ oauth: app })).sort()).toEqual(
      [
        'crm.objects.contacts.read',
        'crm.objects.companies.read',
        'crm.objects.deals.read',
        'crm.objects.tickets.read',
        'crm.objects.owners.read',
        'crm.lists.read',
        'crm.schemas.contacts.read',
        'crm.schemas.companies.read',
        'crm.schemas.deals.read',
        'crm.schemas.custom.read',
      ].sort(),
    );
    expect(oauthScopes(createHubSpot({ oauth: app, scopes: [] }))).toEqual([
      'crm.objects.contacts.read',
    ]);
    expect(Object.entries(hubspotScopes).every(([name, value]) => name === value)).toBe(true);
  });

  it('stores the access token without a network call, and refuses a response without one', () => {
    stubHubSpot(() => json({}));

    expect(
      definition.oauth?.toAuth?.({
        tokens: { access_token: 'access', refresh_token: 'refresh', hub_id: 62515 },
      }),
    ).toEqual({ accessToken: 'access' });
    expect(() => definition.oauth?.toAuth?.({ tokens: { access_token: ' ' } })).toThrow(
      'HubSpot sign-in did not return an access token.',
    );
    expect(calls).toHaveLength(0);
  });

  it("names the account by the user's owner email and the portal ID", async () => {
    let status = 200;

    stubHubSpot(() =>
      status === 200 ? json({ id: '9', email: 'dana@acme.com', userId: 44 }) : json({}, status),
    );

    const client = await createHubSpot({ oauth: app }).client({ req: req() });
    const account = () =>
      definition.oauth?.account?.({
        tokens: { access_token: 'access', hub_id: 62515, user_id: 44 },
        client,
        req: req(),
      });

    await expect(account()).resolves.toEqual({
      id: '62515:44',
      label: 'dana@acme.com (portal 62515)',
      email: 'dana@acme.com',
    });
    expect(path(calls[0])).toBe('/crm/v3/owners/44');
    expect(query(calls[0])).toEqual({ idProperty: 'userId' });

    status = 404;

    await expect(account()).resolves.toEqual({ id: '62515:44', label: 'HubSpot portal 62515' });

    status = 403;

    await expect(account()).rejects.toMatchObject({ status: 403 });
    await expect(
      definition.oauth?.account?.({ tokens: { access_token: 'access' }, client, req: req() }),
    ).rejects.toThrow('HubSpot sign-in did not name the user and portal.');
  });
});
