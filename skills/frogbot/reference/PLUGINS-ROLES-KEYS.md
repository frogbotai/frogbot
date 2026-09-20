# Plugins, Roles, and API Keys

Docs: https://docs.frogbot.ai/plugins/overview, https://docs.frogbot.ai/plugins/roles, and https://docs.frogbot.ai/plugins/api-keys

## Plugins

A FrogBot plugin receives a `FrogbotConfig` and returns a config synchronously or asynchronously. Install plugin packages and add their factories to `plugins`.

```ts
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { FrogbotConfig } from 'frogbot';

const plugins: FrogbotConfig['plugins'] = [
  apiKeysPlugin(),
  rolesPlugin({ roles: ['admin', 'member'] }),
];
```

Order matters when one plugin needs to inspect or extend another plugin's changes. Preserve the order required by each plugin's documentation.

## Roles

`rolesPlugin` adds a `roles` multi-select field to the `users` auth collection when roles are listed. Assignments store literal slugs. There is no role-definition collection, reserved role, implicit superuser, or automatic first-user promotion.

```ts
import { allow, hasRole, rolesPlugin } from '@frogbotai/plugin-roles';
import type { CollectionConfig } from 'frogbot';

rolesPlugin({
  roles: ['admin', 'member', { slug: 'finance', label: 'Finance' }],
  defaultRole: 'member',
});

const access: NonNullable<CollectionConfig['access']> = {
  read: allow('admin', { role: 'member', own: 'owner' }),
  update: ({ req }) => hasRole(req, 'admin', 'finance'),
};
```

`allow` composes role strings, ownership clauses, and access functions. Every role must be named where it applies. Ownership clauses stamp the relationship on create and return a row filter for read, update, and delete. Boolean clauses also work for field and agent access.

Helpers exported by the package are `allow`, `hasRole`, `isLoggedIn`, `ownRows`, `rolesOf`, and `viaApiKey`. `resolveRoles` may provide a synchronous custom role source. `rolesFieldAccess` replaces access on the injected field. An empty role list makes the plugin inert.

## API keys plugin

`apiKeysPlugin` adds an API-key collection, an authentication strategy, and admin controls. The configured owner collection must exist and have auth enabled.

```ts
apiKeysPlugin({
  authCollection: 'accounts',
  collectionSlug: 'credentials',
  tokenPrefix: 'acme',
  headerNames: ['x-service-key'],
  collection: {
    admin: { group: 'Security' },
  },
});
```

| Option           | Default         |
| ---------------- | --------------- |
| `authCollection` | `users`         |
| `collectionSlug` | `api-keys`      |
| `tokenPrefix`    | `fb`            |
| `headerNames`    | `['x-api-key']` |

`collection` supplies collection overrides. `canRevokeAnyKey(req)` may authorize revoking or rotating another owner's key.

Authenticate with `Authorization: Bearer <token>` or an accepted API-key header. A successful request authenticates as the owning user. Plaintext is returned only when a key is minted or rotated; storage contains a SHA-256 hash and display prefix. Unknown, malformed, or revoked keys do not authenticate.

Server exports include `mintApiKey`, `revokeApiKey`, `rotateApiKey`, token creation/extraction/hash helpers, and `isApiKeyStrategy`. Use these exports instead of inventing collection writes or token formats.

The roles plugin is optional. When composing role-aware access for the generated API-key collection, place `rolesPlugin` after `apiKeysPlugin` so it can bind and validate the role clauses.
