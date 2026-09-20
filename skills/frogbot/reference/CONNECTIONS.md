# Connections

Docs: https://docs.frogbot.ai/connections/overview

Connections store owner-scoped credentials for piece instances. Configure them in `frogbot.config.ts` with `ConnectionEntry` from `frogbot`.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createGmail } from '@frogbotai/piece-gmail';
import { buildConfig, type CollectionConfig, type ConnectionEntry } from 'frogbot';

const gmail = createGmail({
  signIn: true,
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});

const connections: ConnectionEntry[] = [{ piece: gmail, oauth: true }];

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [{ slug: 'users', auth: true, fields: [] }],
  connections,
});
```

Use `oauth: true` for a piece instance with an OAuth recipe and factory credentials. Use `secret: true` for a piece with a static auth schema. A piece supporting both may enable both methods in one entry.

Calling a piece action with `req` resolves that owner's active credential. Credentials are encrypted at rest. Returned connection metadata does not expose the credential. Without an applicable owner credential, a statically configured piece can use its factory auth.

## OAuth linking

| Method   | Default path                        | Purpose                                          |
| -------- | ----------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/connections/:piece/authorize` | Start authenticated linking                      |
| `GET`    | `/api/connections/:piece/callback`  | Exchange the code and store the owner credential |
| `POST`   | `/api/connections/:piece`           | Store or replace a secret credential             |
| `DELETE` | `/api/connections/:id`              | Delete an owned connection                       |

The configured API route and connections collection slug replace the defaults. OAuth authorization requires a user from the configured admin user collection. State is single-use, route-bound, browser-bound, and expires after ten minutes. PKCE is used when the piece recipe enables it.

## Sign-in is separate

Interactive OAuth login belongs in an auth collection's `auth.signIn` array, not in `connections`.

```ts
export const Users: CollectionConfig = {
  slug: 'users',
  auth: { signIn: [gmail] },
  fields: [],
};
```

Each provider factory used for login must have OAuth credentials and a recipe with `account`; this makes the instance a sign-in method. FrogBot always identifies a local user by the provider-verified email in the target collection. Provider account IDs and connection rows are never login identities.

Login issues a FrogBot session but never stores provider tokens or creates a connection. Linking stores an owner-scoped credential but never logs the owner in. Keep identity-only and product-access flows separate even when they share OAuth app credentials.
