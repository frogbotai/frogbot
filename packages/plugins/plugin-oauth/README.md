# @frogbotai/plugin-oauth

Register OAuth providers as credential sources for FrogBot pieces. The plugin handles authorization, refresh, and revocation while core owns encrypted connection storage and resolution.

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

The plugin adds the server-only `oauth-states` collection and writes credentials to FrogBot's core `connections` collection. State is single-use and expires after ten minutes. Core encrypts credentials with AES-256-GCM and resolves them for pieces. Expired credentials refresh during resolution when the provider supports refresh.

## Providers

The package exports `googleProvider`, `microsoftProvider`, `stripeProvider`, `zoomProvider`, and `xeroProvider`. Each factory accepts `clientId`, `clientSecret`, optional `scopes`, and an optional `fetch` implementation.

## Custom providers

Implement `OAuthProvider` to add a provider without changing plugin internals:

```ts
import type { OAuthProvider } from '@frogbotai/plugin-oauth';

const provider: OAuthProvider = {
  id: 'service',
  service: 'service',
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

`id` identifies the provider instance and becomes the connection `sourceKey`. `service` must match the canonical service ID declared by the piece. Optional `refresh` and `revoke` methods enable those lifecycle operations.

## Server credentials

Pieces resolve credentials through core:

```ts
const credentials = await frogbot.connections.resolve({
  service: 'google',
  owner: req.user,
});
```

Resolution is owner-scoped. Concurrent refresh calls are not yet coalesced, so multiple calls may refresh the same expired connection.

OAuth connections do not log users in, create users, schedule background refreshes, or provide provider catalog UI.
