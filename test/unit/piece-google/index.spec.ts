import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { Connections } from '../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../packages/frogbot/src/connections/encryption.js';
import {
  createOAuthState,
  exchangeOAuthCode,
  lookupOAuthAccount,
  oauthScopes,
  oauthTokenMetadata,
} from '../../../packages/frogbot/src/connections/oauth/index.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  pieceCapabilities,
  type PieceInstance,
} from '../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createGmail, gmailScopes } from '../../../packages/pieces/piece-gmail/src/index.js';
import {
  createGoogle,
  googleOAuth,
  googleScopes,
} from '../../../packages/pieces/piece-google/src/index.js';
import { createGoogleDrive } from '../../../packages/pieces/piece-google-drive/src/index.js';
import { memoryKV } from '../frogbot/connections/oauth/fixtures.js';

const signal = new AbortController().signal;
const identity = Object.values(googleScopes);
const gmailDefaults = [
  gmailScopes['gmail.send'],
  gmailScopes['gmail.readonly'],
  gmailScopes['gmail.compose'],
];

async function authorizeScope(piece: PieceInstance, flow: 'link' | 'login' = 'link') {
  const { authorizationUrl } = await createOAuthState({
    kv: memoryKV().kv,
    encryption: createCredentialEncryption({ secret: 'test' }),
    piece,
    flow,
    collection: 'users',
    callbackUrl: 'https://app.test/callback',
    cookiePrefix: 'frogbot',
    returnTo: '/admin',
    req: { user: { id: 'owner', collection: 'users' } },
  });

  return new URL(authorizationUrl).searchParams.get('scope')!.split(' ');
}

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
    expect(oauthScopes(google)).toEqual([
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]);
    expect(gmail.oauth).toEqual(google.oauth);
    expect(pieceFactoryDefinition(createGmail).oauth).toMatchObject({
      authorizationUrl: googleOAuth.authorizationUrl,
      tokenUrl: googleOAuth.tokenUrl,
      scopes: {
        catalog: { ...googleScopes, ...gmailScopes },
        required: googleOAuth.scopes.required,
      },
      account: googleOAuth.account,
    });
    expect(oauthScopes(gmail)).toEqual([...identity, ...gmailDefaults]);
    expect(googleOAuth.params).toMatchObject({ access_type: 'offline' });
  });

  it.each([
    ['google', { value: expect.objectContaining({ accessToken: 'google-token' }) }],
    ['gmail', { value: expect.objectContaining({ accessToken: 'google-token' }) }],
    [
      'gmail-missing-permission',
      {
        error: expect.objectContaining({
          code: 'scopes',
          missingScopes: [gmailScopes['gmail.send']],
        }),
      },
    ],
  ])(
    'resolves canonical returned scopes and rejects missing Gmail permission: %s',
    async (scenario, expected) => {
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
      ].filter(
        (scope) => scenario !== 'gmail-missing-permission' || scope !== gmailScopes['gmail.send'],
      );

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            Response.json({ access_token: 'google-token', scope: granted.join(' ') }),
          ),
        ),
      );

      const tokens = await exchangeOAuthCode({
        piece,
        code: 'google-code',
        callbackUrl: 'https://app.test/callback',
      });

      const metadata = oauthTokenMetadata({ tokens, scopes: oauthScopes(piece) });

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
        find: vi.fn(() => Promise.resolve({ docs: [row] })),
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
      } as unknown as FrogBotRequest;

      expect(metadata.scopes).toEqual(granted);
      await expect(
        api.resolve({ piece, req }).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        ),
      ).resolves.toEqual(expected);
    },
  );

  it('adds a Gmail scope to the identity scopes and defaults, once each', async () => {
    const google = createGoogle({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const gmail = createGmail({
      oauth: google.oauth,
      scopes: ({ defaultScopes }) => [...defaultScopes, 'gmail.labels', 'openid', 'gmail.send'],
    });

    expect(await authorizeScope(gmail)).toEqual([
      ...identity,
      ...gmailDefaults,
      gmailScopes['gmail.labels'],
    ]);
    expect(
      await authorizeScope(createGmail({ oauth: google.oauth, scopes: ['gmail.readonly'] })),
    ).toEqual([...identity, gmailScopes['gmail.readonly']]);
    expect(await authorizeScope(createGmail({ oauth: google.oauth, scopes: [] }))).toEqual(
      identity,
    );
  });

  it('keeps a Gmail scope out of Drive and sign-in sharing the same app', async () => {
    const google = createGoogle({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const gmail = createGmail({
      oauth: google.oauth,
      scopes: ({ defaultScopes }) => [...defaultScopes, 'gmail.labels'],
    });

    const drive = createGoogleDrive({ oauth: google.oauth });

    expect(gmail.oauth).toBe(google.oauth);
    expect(google.oauth).toEqual({ clientId: 'client', clientSecret: 'secret' });
    expect(await authorizeScope(gmail)).toContain(gmailScopes['gmail.labels']);
    expect(await authorizeScope(drive)).toEqual([
      ...identity,
      'https://www.googleapis.com/auth/drive',
    ]);
    expect(await authorizeScope(google, 'login')).toEqual(identity);
  });

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
