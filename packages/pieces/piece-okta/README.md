# `@frogbotai/piece-okta`

"Continue with Okta" sign-in for FrogBot.

## Usage

```ts
import { createOkta } from '@frogbotai/piece-okta';

export const Users = {
  slug: 'users',
  auth: {
    signIn: [
      createOkta({
        issuer: 'https://acme.okta.com',
        oauth: {
          clientId: process.env.OKTA_CLIENT_ID!,
          clientSecret: process.env.OKTA_CLIENT_SECRET!,
        },
      }),
    ],
  },
  fields: [],
};
```

Use `https://acme.okta.com/oauth2/default` as the issuer for a custom authorization server. Register `https://<your app>/api/users/sign-in/okta/callback` as a sign-in redirect URI in your Okta app integration. See [OAuth sign-in](https://docs.frogbot.ai/authentication/sign-in#enable-okta-or-any-openid-connect-provider).
