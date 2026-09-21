---
name: frogbot
description: >-
  Builds and maintains FrogBot applications. Use when working with
  frogbot.config.ts, getFrogbot, collections, fields, hooks, access control,
  Local API queries, agents, tools, pieces, connections, jobs, KV, chat or gateway configuration.
license: MIT
metadata:
  author: 'frogbotai'
  version: '0.25.0'
---

# FrogBot Application Development

FrogBot's collections, fields, hooks, access control and Local API behave like Payload CMS; FrogBot names apply.

Use FrogBot names, imports, generated types, and request APIs. Check the installed source and types before assuming an API exists.

## Task Routing

Read the smallest relevant reference before editing:

| Task                                                        | Reference                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Define auth, upload, draft, preview, or managed collections | [COLLECTIONS.md](reference/COLLECTIONS.md)                         |
| Configure fields, recursive structures, slugs, or rich text | [FIELDS.md](reference/FIELDS.md)                                   |
| Inspect or traverse field configuration safely              | [FIELD-TYPE-GUARDS.md](reference/FIELD-TYPE-GUARDS.md)             |
| Add collection or field lifecycle behavior                  | [HOOKS.md](reference/HOOKS.md)                                     |
| Define collection or field permissions                      | [ACCESS-CONTROL.md](reference/ACCESS-CONTROL.md)                   |
| Build scoped, role-aware, or reusable permissions           | [ACCESS-CONTROL-ADVANCED.md](reference/ACCESS-CONTROL-ADVANCED.md) |
| Query through Local, REST, or GraphQL APIs                  | [QUERIES.md](reference/QUERIES.md)                                 |
| Add root or collection HTTP routes                          | [ENDPOINTS.md](reference/ENDPOINTS.md)                             |
| Configure database, storage, or email services              | [ADAPTERS.md](reference/ADAPTERS.md)                               |
| Configure auth, custom admin UI, preview, or localization   | [ADVANCED.md](reference/ADVANCED.md)                               |
| Author a config-transforming plugin                         | [PLUGIN-DEVELOPMENT.md](reference/PLUGIN-DEVELOPMENT.md)           |
| Configure and run agents or runtime skills                  | [AGENTS.md](reference/AGENTS.md)                                   |
| Define and register agent tools                             | [TOOLS.md](reference/TOOLS.md)                                     |
| Configure AI providers or call model operations             | [AI.md](reference/AI.md)                                           |
| Render chat in React                                        | [CHAT-UI.md](reference/CHAT-UI.md)                                 |
| Use or author pieces, actions, and triggers                 | [PIECES.md](reference/PIECES.md)                                   |
| Store user credentials or configure OAuth flows             | [CONNECTIONS.md](reference/CONNECTIONS.md)                         |
| Queue tasks, run workflows, or wait for resumption          | [JOBS.md](reference/JOBS.md)                                       |
| Store expiring values or coordinate with locks              | [KV.md](reference/KV.md)                                           |
| Expose selected operations to MCP clients                   | [MCP.md](reference/MCP.md)                                         |
| Run or embed the AI gateway                                 | [GATEWAY.md](reference/GATEWAY.md)                                 |
| Configure roles or API keys                                 | [PLUGINS-ROLES-KEYS.md](reference/PLUGINS-ROLES-KEYS.md)           |
| Parse typed server environment variables                    | [ENV.md](reference/ENV.md)                                         |

## Quick Start

The blank template keeps collections and agents in separate files and registers them in `src/frogbot.config.ts`:

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents/assistant';
import { Users } from './collections';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  editor: lexicalEditor(),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    defaultModel: 'zen/big-pickle',
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: 'public',
        models: [{ id: 'big-pickle', mode: 'chat' }],
      },
    },
  },
  admin: {},
  agents: [general(), assistant],
};

export default buildConfig(config);
```

Run `frogbot generate:types` after schema changes. Import application document types from `frogbot-types.ts`.

## Essential Patterns

### Collection

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    {
      name: 'status',
      type: 'select',
      options: ['draft', 'published'],
      defaultValue: 'draft',
    },
  ],
  timestamps: true,
};
```

### Hook

```ts
import type { BeforeChangeHook } from 'frogbot';

import type { Post } from '@/frogbot-types';

export const setPublishedAt: BeforeChangeHook<Post> = ({ data, operation }) => {
  if (operation !== 'update' || data.status !== 'published') return data;

  return {
    ...data,
    publishedAt: new Date().toISOString(),
  };
};
```

### Agent

```ts
import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'You are a concise and friendly assistant.',
};
```

An agent without `model` uses `ai.defaultModel`. Root tools are inherited unless `inheritTools: false` is set.

### Initialized Instance

```ts
import { getFrogbot } from 'frogbot';

import config from './frogbot.config';

const frogbot = await getFrogbot({ config });
const posts = await frogbot.find({
  collection: 'posts',
  where: {
    status: { equals: 'published' },
  },
  sort: '-createdAt',
});
```

Inside hooks, endpoints, tools, and other request-aware callbacks, use `req.frogbot` and pass the same `req` into nested operations.

## Critical Pitfalls

### Local API Access Bypass

Local API operations bypass access control by default, even when `user` is supplied. For work performed on behalf of a user, set `overrideAccess: false`:

```ts
const posts = await frogbot.find({
  collection: 'posts',
  user,
  overrideAccess: false,
});
```

Use the default override only for deliberate trusted server work. Field access returns booleans; collection access may also return query constraints.

### Lost Request And Transaction Context

Nested operations without the current request do not share its context or active transaction:

```ts
await req.frogbot.create({
  collection: 'audit-events',
  data: {
    action: 'post-created',
    document: doc.id,
  },
  req,
});
```

Pass `req` from hooks, endpoints, tools, and access functions. Add `overrideAccess: false` when the nested operation must enforce the current user's permissions.

### Hook Loops

A hook that writes to the same collection can trigger itself repeatedly. Carry a context flag through the nested operation:

```ts
async ({ context, doc, req }) => {
  if (context.syncingPost) return doc;

  await req.frogbot.update({
    collection: 'posts',
    id: doc.id,
    data: { synced: true },
    context: { syncingPost: true },
    req,
  });

  return doc;
};
```

Choose a domain-specific flag and check it before side effects.

## Project Layout

```text
src/
├── agents/
│   └── assistant.ts
├── app/
│   └── (frogbot)/
│       ├── [[...segments]]/
│       ├── api/[...slug]/route.ts
│       └── layout.tsx
├── collections/
│   ├── index.ts
│   ├── posts.ts
│   └── users.ts
├── frogbot-types.ts
└── frogbot.config.ts
```

Use `frogbot.config.ts` as the configuration entry, `req.frogbot` in request callbacks, and `frogbot-types.ts` for generated application types.

## Working Rules

- Verify imports against installed public exports; do not invent package subpaths.
- Keep server credentials, database adapters, pieces, and gateway construction out of client components.
- Pass `req` through nested operations and decide explicitly whether access should be overridden.
- Prefer indexed query constraints over per-record or network checks in access functions.
- Use `depth: 0` when relationship IDs are sufficient and `select` when only specific fields are needed.
- Remember that `select` changes returned data but does not narrow the TypeScript return type.
- Configure an editor for every rich text field; nested rich text fields need their own editor.
- Run `frogbot generate:types` after changing collections, fields, jobs, or other generated schemas.
- Keep coding-agent reference files separate from runtime skills configured on an application agent.
- Preserve existing config arrays and nested objects when writing plugins; plugin order is behavior.

## Reference Files

Prefer each bundled local file. If only this hosted entry is available, use its raw fallback; `main` may be newer than installed APIs.

| Topic                   | Local                                                              | Raw fallback                                                                                                        |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Collections             | [COLLECTIONS.md](reference/COLLECTIONS.md)                         | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/COLLECTIONS.md)             |
| Fields                  | [FIELDS.md](reference/FIELDS.md)                                   | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/FIELDS.md)                  |
| Field type guards       | [FIELD-TYPE-GUARDS.md](reference/FIELD-TYPE-GUARDS.md)             | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/FIELD-TYPE-GUARDS.md)       |
| Hooks                   | [HOOKS.md](reference/HOOKS.md)                                     | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/HOOKS.md)                   |
| Access control          | [ACCESS-CONTROL.md](reference/ACCESS-CONTROL.md)                   | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ACCESS-CONTROL.md)          |
| Advanced access control | [ACCESS-CONTROL-ADVANCED.md](reference/ACCESS-CONTROL-ADVANCED.md) | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ACCESS-CONTROL-ADVANCED.md) |
| Queries                 | [QUERIES.md](reference/QUERIES.md)                                 | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/QUERIES.md)                 |
| Endpoints               | [ENDPOINTS.md](reference/ENDPOINTS.md)                             | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ENDPOINTS.md)               |
| Adapters                | [ADAPTERS.md](reference/ADAPTERS.md)                               | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ADAPTERS.md)                |
| Advanced features       | [ADVANCED.md](reference/ADVANCED.md)                               | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ADVANCED.md)                |
| Plugin development      | [PLUGIN-DEVELOPMENT.md](reference/PLUGIN-DEVELOPMENT.md)           | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/PLUGIN-DEVELOPMENT.md)      |
| Agents                  | [AGENTS.md](reference/AGENTS.md)                                   | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/AGENTS.md)                  |
| Tools                   | [TOOLS.md](reference/TOOLS.md)                                     | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/TOOLS.md)                   |
| AI                      | [AI.md](reference/AI.md)                                           | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/AI.md)                      |
| Chat UI                 | [CHAT-UI.md](reference/CHAT-UI.md)                                 | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/CHAT-UI.md)                 |
| Pieces                  | [PIECES.md](reference/PIECES.md)                                   | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/PIECES.md)                  |
| Connections             | [CONNECTIONS.md](reference/CONNECTIONS.md)                         | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/CONNECTIONS.md)             |
| Jobs                    | [JOBS.md](reference/JOBS.md)                                       | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md)                    |
| KV                      | [KV.md](reference/KV.md)                                           | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/KV.md)                      |
| MCP                     | [MCP.md](reference/MCP.md)                                         | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/MCP.md)                     |
| Gateway                 | [GATEWAY.md](reference/GATEWAY.md)                                 | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/GATEWAY.md)                 |
| Roles and API keys      | [PLUGINS-ROLES-KEYS.md](reference/PLUGINS-ROLES-KEYS.md)           | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/PLUGINS-ROLES-KEYS.md)      |
| Environment variables   | [ENV.md](reference/ENV.md)                                         | [raw](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ENV.md)                     |

## Resources

- Docs: <https://docs.frogbot.ai>
- GitHub: <https://github.com/frogbotai/frogbot>
- Examples: <https://github.com/frogbotai/frogbot/tree/main/examples>
- Templates: <https://github.com/frogbotai/frogbot/tree/main/templates>
