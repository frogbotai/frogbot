# FrogBot Access Control

Docs: https://docs.frogbot.ai/access-control/overview, https://docs.frogbot.ai/access-control/collections, and https://docs.frogbot.ai/local-api/access-control

Collection access controls document operations. Field access controls individual values.

| Scope      | Operations                                                              | Result                                           |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| Collection | `create`, `read`, `update`, `delete`, `admin`, `unlock`, `readVersions` | Boolean, or a `Where` constraint where supported |
| Field      | `create`, `read`, `update`                                              | Boolean only                                     |

## Collection access

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => {
      if (req.user) return true;

      return {
        status: {
          equals: 'published',
        },
      };
    },
    update: ({ req }) => {
      if (!req.user) return false;

      return {
        author: {
          equals: req.user.id,
        },
      };
    },
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      options: ['draft', 'published'],
      defaultValue: 'draft',
      index: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
  ],
};
```

Return `false` to deny an operation, `true` to allow every matching document, or a `Where` object to limit matching documents. Query constraints let the database filter rows and avoid per-document lookups.

`admin` controls access to the admin panel for an auth collection. `unlock` controls account unlocks. `readVersions` controls version-history reads; a returned query constrains version records rather than original documents.

## Reusable access functions

```ts
import type { Access } from 'frogbot';

export const anyone: Access = () => true;

export const authenticated: Access = ({ req }) => Boolean(req.user);

export const authenticatedOrPublished: Access = ({ req }) => {
  if (req.user) return true;

  return {
    _status: {
      equals: 'published',
    },
  };
};
```

Keep application access functions near their domain and test anonymous, authenticated, owner, and privileged cases separately.

## Field access

Field access returns only booleans. A denied read omits the field from the response; a denied update prevents that field value from changing.

```ts
import type { FieldAccess, NumberField } from 'frogbot';

const canReadSalary: FieldAccess = ({ doc, req }) => {
  if (!req.user) return false;

  if (req.user.id === doc?.id) return true;

  return Array.isArray(req.user.roles) && req.user.roles.includes('admin');
};

const canUpdateSalary: FieldAccess = ({ req }) => {
  return Array.isArray(req.user?.roles) && req.user.roles.includes('admin');
};

export const salaryField: NumberField = {
  name: 'salary',
  type: 'number',
  access: {
    read: canReadSalary,
    update: canUpdateSalary,
  },
};
```

Nested field callbacks can inspect `siblingData` for values at the same level. Do not return a query constraint from field access.

## Local API enforcement

Local API operations override access control by default. Passing a user does not change that default. Set `overrideAccess: false` whenever an operation must enforce that user's permissions.

```ts
const result = await frogbot.find({
  collection: 'posts',
  user,
  overrideAccess: false,
});
```

Inside hooks or access functions, pass `req` to nested operations so they share request state and any active transaction:

```ts
const result = await req.frogbot.find({
  collection: 'posts',
  req,
  overrideAccess: false,
});
```

Use `overrideAccess: true` only for deliberate trusted server work. Treat a missing `overrideAccess: false` on user-scoped Local API calls as a security defect.

## Cross-collection checks

Use `req.frogbot` for related lookups and preserve `req`.

```ts
import type { Access } from 'frogbot';

export const canDeleteCustomer: Access = async ({ id, req }) => {
  if (!id) return false;

  const contracts = await req.frogbot.find({
    collection: 'contracts',
    depth: 0,
    limit: 0,
    req,
    where: {
      customer: {
        equals: id,
      },
    },
  });

  return contracts.totalDocs === 0;
};
```

Prefer a direct query constraint when it expresses the same rule. It is simpler and avoids extra database work.

## Roles

For FrogBot's managed role system and reusable `allow` clauses, see the [roles plugin documentation](https://docs.frogbot.ai/plugins/roles).
