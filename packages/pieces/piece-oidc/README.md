# `@frogbotai/piece-oidc`

OpenID Connect sign-in for FrogBot: "Continue with SSO" for any provider that publishes a discovery document, such as Auth0, Keycloak or Microsoft Entra. For Okta, use `@frogbotai/piece-okta`.

## Usage

```ts
import { createOidc } from '@frogbotai/piece-oidc';

export const Users = {
  slug: 'users',
  auth: {
    signIn: [
      createOidc({
        issuer: process.env.SSO_ISSUER!,
        oauth: {
          clientId: process.env.SSO_CLIENT_ID!,
          clientSecret: process.env.SSO_CLIENT_SECRET!,
        },
      }),
    ],
  },
  fields: [],
};
```

Register `https://<your app>/api/users/sign-in/oidc/callback` as the redirect URI. See [OAuth sign-in](https://docs.frogbot.ai/authentication/sign-in#enable-okta-or-any-openid-connect-provider) for the options.
