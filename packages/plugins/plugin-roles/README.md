# @frogbotai/plugin-roles

Code-defined role-based access control for FrogBot.

## Install

```bash
pnpm add @frogbotai/plugin-roles
```

## Configure

```ts
import { can, canAgent, canField, rolesPlugin } from '@frogbotai/plugin-roles'
import { buildConfig } from 'frogbot'

export default buildConfig({
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'budgets',
      access: { read: can('budgets:read') },
      fields: [
        {
          name: 'limitUSD',
          type: 'number',
          access: { update: canField('budgets:manage') },
        },
      ],
    },
  ],
  agents: [
    {
      slug: 'assistant',
      model: 'openai/gpt-5',
      instructions: 'Help the user.',
      access: canAgent('agents:run'),
    },
  ],
  plugins: [
    rolesPlugin({
      resources: [
        { slug: 'agents', actions: ['run'] },
        { slug: 'budgets', actions: ['read', 'manage'] },
      ],
      roles: [
        {
          slug: 'admin',
          name: 'Administrator',
          grants: [{ resource: '*', actions: ['*'] }],
        },
        {
          slug: 'member',
          name: 'Member',
          grants: [
            { resource: 'agents', actions: ['run'] },
            { resource: 'budgets', actions: ['read'] },
          ],
        },
      ],
    }),
  ],
})
```

Roles and grants are defined in code. The plugin synchronizes them into a read-only `roles` collection and adds an editable roles relationship to the auth collection. The first user receives the configured `admin` role unless the create operation supplies roles explicitly.

`can()` returns a Payload collection access function and compiles an `own` grant to a query. `canField()` and `canAgent()` return booleans because fields and agents do not accept query constraints.

```ts
can('usage-logs:read', { ownerField: 'user' })
```

The plugin sets auth relationship depth to at least one and preserves any higher configured depth. Access is denied if a request does not contain populated role documents.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `roles` | `admin`, `member`, `viewer` | Code-defined roles and grants. |
| `resources` | unrestricted | Optional resource/action registry used to validate grants at startup. |
| `authCollection` | `users` | Auth-enabled collection receiving role assignments. |
| `collectionSlug` | `roles` | Read-only role projection collection. |
| `fieldName` | `roles` | Relationship field added to the auth collection. |
| `adminRole` | `admin` | Role assigned to the first user. |
| `collection` | none | Additional roles collection configuration and non-reserved fields. |

Internal operations using `overrideAccess: true` continue to bypass role access functions.
