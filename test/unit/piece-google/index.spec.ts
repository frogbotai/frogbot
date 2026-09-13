import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { Connections } from '../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../packages/frogbot/src/connections/encryption.js';
import {
  exchangeOAuthCode,
  lookupOAuthAccount,
  oauthTokenMetadata,
} from '../../../packages/frogbot/src/connections/oauth/index.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { pieceCapabilities } from '../../../packages/frogbot/src/pieces/types.js';
import type { FrogbotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createGmail, gmailScopes } from '../../../packages/pieces/piece-gmail/src/index.js';
import { createGoogle, googleOAuth } from '../../../packages/pieces/piece-google/src/index.js';

const signal = new AbortController().signal;
const account = () =>
  googleOAuth.account({
    tokens: { access_token: 'access' },
    client: undefined,
    req: { signal } as never,
  });

afterEach(() => vi.unstubAllGlobals());

describe('Google identity', () => {
  it('supports identity-only sign-in and shares its app without sharing product scopes', () => {
    const google = createGoogle({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const gmail = createGmail({ oauth: google.oauth });
    expect(pieceInstanceTools(google)).toEqual([]);
    expect(google[pieceCapabilities]).toMatchObject({ signIn: true });
    expect(pieceFactoryDefinition(createGoogle).oauth).toBe(googleOAuth);
    expect(googleOAuth.scopes).toEqual([
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]);
    expect(gmail.oauth).toEqual(google.oauth);
    expect(pieceFactoryDefinition(createGmail).oauth).toMatchObject({
      authorizationUrl: googleOAuth.authorizationUrl,
      tokenUrl: googleOAuth.tokenUrl,
      scopes: [...googleOAuth.scopes, ...gmailScopes],
      account: googleOAuth.account,
    });
    expect(googleOAuth.params).toMatchObject({ access_type: 'offline' });
  });

  it.each(['google', 'gmail', 'gmail-missing-permission'])(
    'resolves canonical returned scopes and rejects missing Gmail permission: %s',
    async (scenario) => {
      const google = createGoogle({ oauth: { clientId: 'client', clientSecret: 'secret' } });
      const piece = scenario === 'google' ? google : createGmail({ oauth: google.oauth });
      const granted = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        ...(scenario === 'google'
          ? []
          : [
              'https://www.googleapis.com/auth/gmail.send',
              'https://www.googleapis.com/auth/gmail.readonly',
              'https://www.googleapis.com/auth/gmail.compose',
            ]),
      ].filter((scope) => scenario !== 'gmail-missing-permission' || scope !== gmailScopes[0]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({ access_token: 'google-token', scope: granted.join(' ') }),
        ),
      );
      const tokens = await exchangeOAuthCode({
        piece,
        code: 'google-code',
        callbackUrl: 'https://app.test/callback',
      });
      const metadata = oauthTokenMetadata({
        tokens,
        scopes: [...googleOAuth.scopes, ...gmailScopes],
      });
      const encryption = createCredentialEncryption({ secret: 'test' });
      const row = {
        id: 'connection',
        owner: 'owner',
        piece: piece.piece,
        method: 'oauth',
        status: 'active',
        credential: await encryption.encrypt(JSON.stringify(tokens)),
        ...metadata,
      };
      const frogbot = {
        config: { _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) } },
        find: vi.fn(async () => ({ docs: [row] })),
      };
      const api = new Connections(frogbot as never, {
        enabled: true,
        slug: 'connections',
        encryption,
        entries: { [piece.piece]: { piece, oauth: true, secret: false } },
      });
      const req = {
        user: { id: 'owner', collection: 'users' },
        frogbot,
      } as unknown as FrogbotRequest;
      expect(metadata.scopes).toEqual(granted);
      if (scenario === 'gmail-missing-permission') {
        await expect(api.resolve({ piece, req })).rejects.toMatchObject({
          code: 'scopes',
          missingScopes: [gmailScopes[0]],
        });
      } else {
        await expect(api.resolve({ piece, req })).resolves.toMatchObject({
          accessToken: 'google-token',
        });
      }
    },
  );

  it('looks up a verified identity with the access token and request cancellation signal', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        sub: 'google-user',
        name: 'Google User',
        email: 'user@example.com',
        email_verified: true,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(account()).resolves.toEqual({
      id: 'google-user',
      label: 'Google User',
      email: 'user@example.com',
    });
    expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: 'Bearer access' },
      signal,
    });
  });

  it('uses the verified email as the label when the name is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          sub: 'google-user',
          email: 'user@example.com',
          email_verified: true,
        }),
      ),
    );
    await expect(
      lookupOAuthAccount({
        piece: createGoogle({ oauth: { clientId: 'client', clientSecret: 'secret' } }),
        tokens: { access_token: 'access' },
        req: { signal } as never,
      }),
    ).resolves.toMatchObject({ label: 'user@example.com' });
  });

  it.each([false, undefined, 'true', 1, null])(
    'rejects email_verified=%s',
    async (email_verified) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            sub: 'google-user',
            email: 'user@example.com',
            email_verified,
          }),
        ),
      );
      await expect(account()).rejects.toThrow('Google did not return a verified email address.');
    },
  );

  it.each([
    null,
    { sub: '', email: 'user@example.com', email_verified: true },
    { sub: 123, email: 'user@example.com', email_verified: true },
    { sub: 'google-user', email: ' ', email_verified: true },
    { sub: 'google-user', email_verified: true },
  ])('rejects malformed identity %j', async (identity) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(identity)));
    await expect(account()).rejects.toThrow('Google did not return a verified email address.');
  });

  it('does not include provider response details in lookup errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private provider details', { status: 401 })),
    );
    await expect(account()).rejects.toThrow('Google account lookup failed.');
  });
});
