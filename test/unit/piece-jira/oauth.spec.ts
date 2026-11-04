import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { oauthScopes } from '../../../packages/frogbot/src/connections/oauth/scopes.js';
import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createJira, jiraScopes } from '../../../packages/pieces/piece-jira/src/index.js';
import { calls, json, oauth, req, site, stubJira } from './fixtures.js';

const app = { clientId: 'client', clientSecret: 'secret' };

afterEach(() => vi.unstubAllGlobals());

describe('Jira OAuth', () => {
  const definition = pieceFactoryDefinition(createJira);

  it("signs in at Atlassian with the api.atlassian.com audience and Jira's scopes", () => {
    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      scopeSeparator: ' ',
      params: { audience: 'api.atlassian.com', prompt: 'consent' },
      scopes: { catalog: jiraScopes },
    });
    expect(oauthScopes(createJira({ oauth: app })).sort()).toEqual(
      [
        'offline_access',
        'read:jira-work',
        'read:jira-user',
        'write:jira-work',
        'read:board-scope:jira-software',
        'read:sprint:jira-software',
        'read:project:jira',
      ].sort(),
    );
    expect(oauthScopes(createJira({ oauth: app, scopes: [] })).sort()).toEqual(
      ['offline_access', 'read:jira-user', 'read:jira-work'].sort(),
    );
  });

  it('stores the access token, and refuses a response without one', () => {
    expect(
      definition.oauth?.toAuth?.({ tokens: { access_token: 'access', refresh_token: 'r' } }),
    ).toEqual({ accessToken: 'access' });
    expect(() => definition.oauth?.toAuth?.({ tokens: {} })).toThrow(
      'Atlassian sign-in did not return an access token.',
    );
  });

  it('marks the API token and access token secret', () => {
    const shape = z.toJSONSchema(definition.auth!, { io: 'input' }).properties;

    expect(shape?.apiToken).toMatchObject({ secret: true });
    expect(shape?.accessToken).toMatchObject({ secret: true });
  });

  it('names the account from /myself, with its email when shared', async () => {
    let email: string | undefined = 'dana@acme.com';

    stubJira((call) =>
      call.url.endsWith('/accessible-resources')
        ? json([{ id: 'cloud-a', url: site, name: 'acme' }])
        : json({ accountId: 'acc-1', displayName: 'Dana', emailAddress: email }),
    );

    const jira = createJira({ oauth: app });
    const client = await jira.client({ req: req(oauth) });
    const account = () =>
      definition.oauth?.account?.({
        tokens: { access_token: 'atlassian-token' },
        client,
        req: req(oauth),
      });

    await expect(account()).resolves.toEqual({
      id: 'acc-1',
      label: 'Dana',
      email: 'dana@acme.com',
    });
    expect(calls[1]?.url).toBe('https://api.atlassian.com/ex/jira/cloud-a/rest/api/3/myself');

    email = undefined;

    await expect(account()).resolves.toEqual({ id: 'acc-1', label: 'Dana' });
  });
});
