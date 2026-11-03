import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-microsoft',
  () => import('../../../packages/pieces/piece-microsoft/src/index.js'),
);

import { oauthScopes } from '../../../packages/frogbot/src/connections/oauth/scopes.js';
import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createMicrosoftOutlook,
  defineMicrosoftOutlook,
  microsoftOutlookScopes,
} from '../../../packages/pieces/piece-microsoft-outlook/src/index.js';
import { calls, json, req, stubGraph } from './fixtures.js';

const app = { clientId: 'client', clientSecret: 'secret' };

afterEach(() => vi.unstubAllGlobals());

describe('Outlook OAuth', () => {
  it('signs in at the commercial common tenant with the mail, calendar and contacts scopes', () => {
    const definition = pieceFactoryDefinition(createMicrosoftOutlook);

    expect(definition).toMatchObject({
      slug: 'microsoft-outlook',
      label: 'Microsoft Outlook',
      admin: { group: 'Communication' },
    });
    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      params: { prompt: 'select_account' },
      scopes: { catalog: microsoftOutlookScopes },
    });
    expect(oauthScopes(createMicrosoftOutlook({ oauth: app })).sort()).toEqual(
      [
        'offline_access',
        'User.Read',
        'openid',
        'email',
        'profile',
        'Mail.ReadWrite',
        'Mail.Send',
        'Calendars.ReadWrite',
        'Contacts.Read',
      ].sort(),
    );
    expect(z.toJSONSchema(definition.auth!).properties?.accessToken).toMatchObject({
      secret: true,
    });
  });

  it('pins the US Government cloud and tenant into the URLs and the stored credential', async () => {
    const createGovernment = defineMicrosoftOutlook({
      cloud: 'usGovernment',
      tenantId: 'contoso.onmicrosoft.com',
    });

    const definition = pieceFactoryDefinition(createGovernment);
    const stored = definition.oauth?.toAuth?.({
      tokens: { access_token: 'access', refresh_token: 'refresh' },
    });

    expect(definition.oauth).toMatchObject({
      authorizationUrl:
        'https://login.microsoftonline.us/contoso.onmicrosoft.com/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.us/contoso.onmicrosoft.com/oauth2/v2.0/token',
    });
    expect(stored).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      cloud: 'login.microsoftonline.us',
      tenantId: 'contoso.onmicrosoft.com',
    });
    expect(() =>
      createGovernment({ auth: { accessToken: 't', cloud: 'login.microsoftonline.com' } }),
    ).toThrow();

    stubGraph(() => json({ id: 'u1', displayName: 'Dana', mail: 'dana@acme.us' }));

    const account = await definition.oauth?.account?.({
      tokens: { access_token: 'access' },
      client: await createGovernment({ oauth: app }).client({ req: req(stored) }),
      req: req(stored),
    });

    expect(account).toEqual({ id: 'u1', label: 'Dana', email: 'dana@acme.us' });
    expect(calls[0]?.url).toBe('https://graph.microsoft.us/v1.0/me');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer access');
  });
});
