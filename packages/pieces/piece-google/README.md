# `@frogbotai/piece-google`

Google identity for FrogBot sign-in and shared Google OAuth apps.

## Usage

```ts
import { createGoogle } from '@frogbotai/piece-google';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
```

## OAuth scopes

Sign-in always requests `openid`, `userinfo.email` and `userinfo.profile`. Names stand for `https://www.googleapis.com/auth/<name>`, except `openid`. `googleScopes` maps each name to its URL; the Google product pieces include these names in their own catalogs.
