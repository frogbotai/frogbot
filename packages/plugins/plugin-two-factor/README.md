# @frogbotai/plugin-two-factor

Two-factor sign-in for FrogBot. After the password or a sign-in provider, a user with it on enters a code from an authenticator app or a recovery code before they get a session.

```ts
import { twoFactor } from '@frogbotai/plugin-two-factor';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [] }],
  plugins: [twoFactor({ issuer: 'Acme' })],
});
```
