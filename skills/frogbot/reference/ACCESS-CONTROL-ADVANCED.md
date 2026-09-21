# Advanced FrogBot Access Control

Docs: https://docs.frogbot.ai/access-control/collections and https://docs.frogbot.ai/plugins/roles

Build advanced rules from query constraints, small factories, request context, and FrogBot's roles plugin. Start with the [access control documentation](https://docs.frogbot.ai/access-control/overview) for return values and Local API enforcement.

## Scoped access factories

Factories keep repeated row constraints consistent.

```ts
import type { Access } from 'frogbot';

export function organizationScoped(): Access {
  return ({ req }) => {
    const user = req.user;

    if (!user) return false;

    const organizationIds = Array.isArray(user.organizationIds)
      ? user.organizationIds.filter(
          (id): id is number | string => typeof id === 'number' || typeof id === 'string',
        )
      : [];

    return {
      organization: {
        in: organizationIds,
      },
    };
  };
}
```

An empty membership list yields no matching organizations. Add a privileged bypass only when the application explicitly requires one; admin-panel access does not automatically grant a role bypass.

## Time-limited rows

Use indexed date fields in query constraints.

```ts
import type { Access } from 'frogbot';

export function recentRecords(days: number): Access {
  return ({ req }) => {
    if (!req.user) return false;

    const cutoff = new Date();

    cutoff.setDate(cutoff.getDate() - days);

    return {
      createdAt: {
        greater_than_equal: cutoff.toISOString(),
      },
    };
  };
}
```

Compute the cutoff for each request. Tests that depend on time should use a controllable clock.

## Combining constraints

Compose ownership and publication rules with `and` and `or`.

```ts
import type { Access } from 'frogbot';

export const publishedOrOwned: Access = ({ req }) => {
  if (!req.user) {
    return {
      status: {
        equals: 'published',
      },
    };
  }

  return {
    or: [
      {
        status: {
          equals: 'published',
        },
      },
      {
        author: {
          equals: req.user.id,
        },
      },
    ],
  };
};
```

Index fields used frequently in access constraints.

## Roles plugin

Install `@frogbotai/plugin-roles`, configure roles, and use `allow` in collection or field access. The plugin adds the managed `roles` field to the `users` auth collection.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import { allow, rolesPlugin } from '@frogbotai/plugin-roles';

import { MemberDocuments } from './collections/MemberDocuments';
import { Users } from './collections/Users';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [Users, MemberDocuments],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'member', 'owner'],
      defaultRole: 'member',
      rolesFieldAccess: {
        create: allow('owner'),
        update: allow('owner'),
      },
    }),
  ],
});
```

```ts
import type { CollectionConfig } from 'frogbot';
import { allow } from '@frogbotai/plugin-roles';

export const MemberDocuments: CollectionConfig = {
  slug: 'member-documents',
  access: {
    create: allow('member'),
    read: allow('member'),
    update: allow('owner'),
    delete: allow('admin'),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
  ],
};
```

Every role named by `allow` must be listed in `rolesPlugin`. Restrict both creation and updates of the generated roles field with `rolesFieldAccess`. A default role does not prevent callers from supplying privileged roles on create. Bootstrap the first owner through trusted server code with an explicit access override.

The plugin also exports `hasRole`, `isLoggedIn`, `ownRows`, `rolesOf`, and `viaApiKey` predicates for composing clauses. Use only predicates that match the application's authentication path and ownership schema.

## Owned rows

The roles plugin accepts ownership clauses through `allow`. Ownership fields must be relationships to the `users` auth collection. On create, FrogBot stamps eligible ownership fields from the authenticated user.

```ts
import type { CollectionConfig } from 'frogbot';
import { allow } from '@frogbotai/plugin-roles';

export const Projects: CollectionConfig = {
  slug: 'projects',
  access: {
    create: allow({
      role: 'member',
      own: 'owner',
    }),
    read: allow('admin', {
      role: 'member',
      own: 'owner',
    }),
    update: allow('admin', {
      role: 'member',
      own: 'owner',
    }),
    delete: allow('admin'),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
  ],
};
```

Ownership clauses cannot be used for field access. Use role-only clauses there.

## Request-local caching

Store repeated checks in `req.context`, which is isolated to one request.

```ts
import type { Access } from 'frogbot';

export const activeAccount: Access = async ({ req }) => {
  if (!req.user) return false;

  if (typeof req.context.activeAccount === 'boolean') {
    return req.context.activeAccount;
  }

  const user = await req.frogbot.findByID({
    collection: 'users',
    id: req.user.id,
    req,
  });

  const allowed = user.status === 'active';

  req.context.activeAccount = allowed;

  return allowed;
};
```

Pass `req` to preserve the transaction and cache. Avoid external network calls in hot access paths when a stored, indexed attribute or query constraint can express the rule.

## Verification checklist

- Test anonymous, each role, owner, non-owner, and API-key paths that the rule supports.
- Test Local API calls with `overrideAccess: false`; a user argument alone does not enforce permissions.
- Confirm denied collection rows are absent and denied field reads are omitted.
- Confirm account creation and role updates cannot grant privilege outside `rolesFieldAccess`.
- Keep ownership and organization fields indexed when they appear in common constraints.
