# @frogbotai/plugin-two-factor

Two-factor sign-in for FrogBot. After the password or a sign-in provider, a user with it on enters a code from an authenticator app or a recovery code before they get a session. No session exists until the code is accepted.

Full guide: [Two-factor sign-in](https://docs.frogbot.ai/plugins/two-factor).

## Setup

```bash
pnpm add @frogbotai/plugin-two-factor
```

```ts
import { twoFactor } from '@frogbotai/plugin-two-factor';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [{ name: 'role', type: 'text' }] }],
  plugins: [
    twoFactor({
      issuer: 'Acme',
      require: ({ user }) => user.role === 'admin',
      canReset: ({ req }) => req.user?.role === 'admin',
    }),
  ],
});
```

Run `frogbot generate:importmap` in build-only workflows after adding the plugin; `frogbot dev` does it for you.

The plugin adds `twoFactorEnabled` (read-only, with the account section) and three hidden fields to the auth collection: the TOTP secret, encrypted with `connections.encryption`; the recovery codes, hashed; and the last accepted time step.

## Options

| Option                     | Default      | Description                                                                                                                        |
| -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `collection`               | `admin.user` | Auth collection that gets two-factor sign-in.                                                                                      |
| `require({ req, user })`   | nobody       | Users who must have it: setup at the next sign-in, and they can't turn it off.                                                     |
| `canEnable({ req, user })` | everyone     | Users who may turn it on; `false` gives `403`.                                                                                     |
| `canReset({ req })`        | nobody       | Whether the signed-in user may reset someone else's.                                                                               |
| `issuer`                   | `'FrogBot'`  | Name authenticator apps show.                                                                                                      |
| `emails`                   | built-in     | Replace an event's email (`enabled`, `disabled`, `recoveryCodeUsed`, `recoveryCodesCreated`, `reset`) or turn it off with `false`. |

## Turning it on

The user's account section shows a QR code and the key as text, asks for a current code, then shows 10 recovery codes once with copy and download. Turning it on ends every other session of that user. **New recovery codes** needs a code and voids the old set; **Turn off** needs a code or a recovery code. API keys aren't affected.

Codes are RFC 6238 (SHA-1, 30 s, one step of drift), each usable once. Five wrong codes in 10 minutes lock code entry for that user for 10 minutes.

## Require

A required user without two-factor sign-in goes to setup at their next sign-in, before any session exists, including the first user at registration. While `require` returns true, **Turn off** is hidden and `POST /two-factor/disable` answers `403`.

## Recovery and reset

A recovery code signs in once. When `canReset` allows it, another user's document shows **Reset two-factor sign-in**: it removes their secret and codes, ends every session and clears the lock. Nobody can reset their own.

## Sessions and password login

- Sign-in methods pause in the collection's `beforeSignIn` hook and redirect to the code page at `/api/<collection>/two-factor`.
- The admin's login view is replaced (unless the app sets `admin.components.views.login`) by one with the same slots whose form follows the code step.
- `POST /api/<collection>/login` answers `202 { message, twoFactor: 'code' | 'setup', url }` with no token. Post `{ code }` to `<url>/verify` with the returned cookie for the normal login response. A `returnTo` path in the login body makes the code page continue there.
- `POST /api/<collection>/reset-password` saves the password and ends every session, but signs nobody in who needs a code: `{ message, twoFactor: 'signIn' }`.

The paused sign-in is a 10-minute, single-use KV record behind an HttpOnly, `SameSite=Lax` cookie scoped to the code endpoints. It grants no access on its own.

## Limits

- GraphQL `loginUsers` and the Local API `login` have no code step and fail for users who need a code or setup.
- `canReset` defaults to nobody: without it, a user who loses their authenticator and recovery codes can't get back in.
- No passkeys, security keys or per-tenant settings.
