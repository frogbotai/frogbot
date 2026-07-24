# @frogbotai/plugin-oauth

Add owner-scoped OAuth connections with encrypted credentials, refresh, and revocation to a FrogBot application.

```ts
import { googleProvider, oauthPlugin } from '@frogbotai/plugin-oauth';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [] }],
  plugins: [
    oauthPlugin({
      providers: [
        googleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ],
    }),
  ],
});
```

Register `https://your-app.example/api/users/oauth/google/callback` with Google. An authenticated user starts the flow at:

```http
GET /api/users/oauth/google/authorize?returnUrl=/settings
```

The plugin adds server-only `oauth-states` and owner-scoped `oauth-connections` collections. State is single-use and expires after ten minutes. Access tokens, refresh tokens, and ID tokens are encrypted with AES-256-GCM before storage and are hidden from collection reads.

## Providers

The package exports `googleProvider`, `microsoftProvider`, `stripeProvider`, `zoomProvider`, and `xeroProvider`. Each factory accepts `clientId`, `clientSecret`, optional `scopes`, and an optional `fetch` implementation.

## Custom providers

Implement `OAuthProvider` to add a provider without changing plugin internals:

```ts
import type { OAuthProvider } from '@frogbotai/plugin-oauth';

const provider: OAuthProvider = {
  id: 'service',
  authorizationUrl: 'https://service.example/oauth/authorize',
  tokenUrl: 'https://service.example/oauth/token',
  scopes: ['profile'],
  authorize: ({ callbackUrl, codeChallenge, state }) => {
    const url = new URL('https://service.example/oauth/authorize');
    url.search = new URLSearchParams({
      redirect_uri: callbackUrl,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    }).toString();
    return url;
  },
  exchange: async ({ code, codeVerifier }) => exchangeCode({ code, codeVerifier }),
  getAccount: async ({ tokens }) => loadAccount({ accessToken: tokens.accessToken }),
};
```

Optional `refresh` and `revoke` methods enable those lifecycle operations.

## Server credentials

Use the same encryption adapter for plugin storage and server-side retrieval:

```ts
import { createOAuthEncryption, getOAuthConnectionCredentials } from '@frogbotai/plugin-oauth/server';

const encryption = createOAuthEncryption({ secret: process.env.FROGBOT_SECRET! });

const credentials = await getOAuthConnectionCredentials({
  req,
  connectionId,
  encryption,
});
```

The helper returns credentials only when the connection belongs to `req.user`.

OAuth connections do not log users in, create users, schedule background refreshes, or provide provider catalog UI.
