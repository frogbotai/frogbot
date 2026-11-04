import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { oauthScopes } from '../../../packages/frogbot/src/connections/oauth/scopes.js';
import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createSalesforce,
  defineSalesforce,
} from '../../../packages/pieces/piece-salesforce/src/index.js';
import { auth, calls, instance, json, req, stubSalesforce } from './fixtures.js';

const app = { clientId: 'client', clientSecret: 'secret' };
const definition = pieceFactoryDefinition(createSalesforce);

afterEach(() => vi.unstubAllGlobals());

describe('Salesforce piece', () => {
  it('is the Salesforce piece in Sales and CRM', () => {
    expect(definition).toMatchObject({
      slug: 'salesforce',
      label: 'Salesforce',
      admin: { group: 'Sales and CRM' },
    });
  });

  it('marks every read primitive idempotent', () => {
    const reads = [
      'query',
      'listObjects',
      'describeObject',
      'getQueryJob',
      'getQueryJobResults',
    ].map((slug) => definition.actions.find((action) => action.slug === slug));

    expect(reads.every((action) => action?.idempotent === true)).toBe(true);
  });

  it('marks the access token secret', () => {
    const shape = z.toJSONSchema(definition.auth!, { io: 'input' }).properties;

    expect(shape?.accessToken).toMatchObject({ secret: true });
  });
});

describe('Salesforce login hosts', () => {
  it.each([
    [undefined, 'login.salesforce.com'],
    ['test.salesforce.com', 'test.salesforce.com'],
    ['Acme.My.Salesforce.com', 'acme.my.salesforce.com'],
    ['acme--uat.sandbox.my.salesforce.com', 'acme--uat.sandbox.my.salesforce.com'],
  ])('signs in at %s with PKCE', (loginHost, host) => {
    expect(pieceFactoryDefinition(defineSalesforce({ loginHost })).oauth).toMatchObject({
      authorizationUrl: `https://${host}/services/oauth2/authorize`,
      tokenUrl: `https://${host}/services/oauth2/token`,
      pkce: true,
      tokenLifetime: 900,
    });
  });

  it.each([
    'evil.example.com',
    'login.salesforce.com.evil.com',
    'my.salesforce.com',
    'https://login.salesforce.com',
  ])('refuses login host %s at define time', (loginHost) => {
    expect(() => defineSalesforce({ loginHost })).toThrow('Salesforce loginHost must be');
  });

  it('asks for api by default and always for refresh_token and id', () => {
    expect(oauthScopes(createSalesforce({ oauth: app })).sort()).toEqual(
      ['api', 'id', 'refresh_token'].sort(),
    );
    expect(oauthScopes(createSalesforce({ oauth: app, scopes: ['full'] })).sort()).toEqual(
      ['full', 'id', 'refresh_token'].sort(),
    );
  });
});

describe('Salesforce OAuth', () => {
  it('stores the token, instance URL and identity URL without a network call', () => {
    stubSalesforce(() => json({}));

    expect(
      definition.oauth?.toAuth?.({
        tokens: {
          access_token: 'access',
          refresh_token: 'refresh',
          instance_url: instance,
          id: auth.identityUrl,
          issued_at: '1700000000000',
        },
      }),
    ).toEqual({ accessToken: 'access', instanceUrl: instance, identityUrl: auth.identityUrl });
    expect(() => definition.oauth?.toAuth?.({ tokens: { access_token: 'access' } })).toThrow(
      'Salesforce sign-in did not return an access token and instance URL.',
    );
    expect(calls).toHaveLength(0);
  });

  it('names the account from the identity URL', async () => {
    stubSalesforce(() =>
      json({
        user_id: '005000000000001AAA',
        organization_id: '00D000000000001AAA',
        username: 'dana@acme.com.prod',
        display_name: 'Dana Scully',
        email: 'dana@acme.com',
      }),
    );

    const client = await createSalesforce({ oauth: app }).client({ req: req() });

    await expect(
      definition.oauth?.account?.({ tokens: { access_token: 'access' }, client, req: req() }),
    ).resolves.toEqual({
      id: '00D000000000001AAA:005000000000001AAA',
      label: 'Dana Scully (dana@acme.com)',
      email: 'dana@acme.com',
    });
    expect(calls[0]?.url).toBe(auth.identityUrl);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer salesforce-token');
  });

  it('never sends the token to an identity URL off the login and instance hosts', async () => {
    stubSalesforce(() => json({}));

    const foreign = { ...auth, identityUrl: 'https://evil.example.com/id/00D/005' };
    const client = await createSalesforce({}).client({
      req: req({
        frogbot: {
          connections: {
            resolvePieceCredential: vi.fn().mockResolvedValue({ auth: foreign, key: {} }),
          },
        },
      }),
    });

    await expect(client.identity()).rejects.toThrow('not on the login or instance host');
    expect(calls).toHaveLength(0);
  });
});
