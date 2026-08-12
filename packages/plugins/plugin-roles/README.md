# @frogbotai/plugin-roles

Code-defined role assignment and access helpers for FrogBot.

## Install

```bash
pnpm add @frogbotai/plugin-roles
```

## Configure

```ts
import { allow, rolesPlugin } from '@frogbotai/plugin-roles'
import { buildConfig } from 'frogbot'

export default buildConfig({
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'projects',
      access: {
        create: allow({ role: 'member', own: 'owner' }),
        read: allow('finance', { role: 'member', own: 'owner' }),
      },
      fields: [
        { name: 'owner', type: 'relationship', relationTo: 'users', required: true },
      ],
    },
  ],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'member', { slug: 'finance', label: 'Finance' }],
    }),
  ],
})
```

Configured roles are stored as slugs in a `roles` select field on the `users` collection. No field is added when `roles` is omitted or empty. Roles have no reserved or implicit behavior: `allow('finance')` grants only `finance`.

`allow()` accepts role slugs, ownership clauses, and native access functions. Boolean-only clauses work in collection, field, and agent access slots. Ownership or `Where` clauses work only in collection access slots.

## Predicates

```ts
import { hasRole, isLoggedIn, ownRows, rolesOf, viaApiKey } from '@frogbotai/plugin-roles'

hasRole(req, 'finance', 'auditor')
isLoggedIn(req)
ownRows(req, 'owner')
rolesOf(req)
viaApiKey(req)
```

## Custom Resolution

```ts
rolesPlugin({
  roles: ['admin', 'member'],
  resolveRoles: (req) => req.user?.tenantRoles ?? [],
})
```

Role resolution is memoized per request. `rolesPlugin()` and `rolesPlugin({ roles: [] })` are no-ops.

Use `defaultRole` to assign new users that omit `roles`. Role-field updates default to assigned `admin` users when `admin` is listed and deny everyone otherwise; replace this with `rolesFieldAccess` when needed. Bootstrap the first privileged user explicitly through Payload's Local API or a seed script.
