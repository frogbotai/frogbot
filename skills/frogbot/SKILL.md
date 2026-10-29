---
name: frogbot
description: >-
  Builds and maintains FrogBot applications. Use when working with
  frogbot.config.ts, getFrogBot, collections, fields, hooks, access control,
  Local API queries, agents, tools, pieces, connections, jobs, KV, chat or gateway configuration,
  or when sharing, hosting or deploying a FrogBot app with the Dojo plugin's `frogbot share`,
  `pull` or `logs`.
license: MIT
metadata:
  author: 'frogbotai'
  version: '0.36.0'
---

# FrogBot Application Development

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
| Expose operations to MCP clients, or call MCP servers       | [MCP.md](reference/MCP.md)                                         |
| Run or embed the AI gateway                                 | [GATEWAY.md](reference/GATEWAY.md)                                 |
| Configure roles or API keys                                 | [PLUGINS-ROLES-KEYS.md](reference/PLUGINS-ROLES-KEYS.md)           |
| Parse typed server environment variables                    | [ENV.md](reference/ENV.md)                                         |

## Quick Start

The blank template keeps collections and agents in separate files and registers them in `src/frogbot.config.ts`:

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents/assistant';
import { Files } from './collections/Files';
import { Users } from './collections/Users';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  editor: lexicalEditor(),
  collections: [Users, Files],
  tools: [...todoTools],
  ai: {
    defaultModel: 'openai/gpt-5.4-mini',
    providers: { openai: true }, // reads OPENAI_API_KEY from .env
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
import type { CollectionBeforeChangeHook } from 'frogbot';

import type { Post } from '@/frogbot-types';

export const setPublishedAt: CollectionBeforeChangeHook<Post> = ({ data, operation }) => {
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

Use `model: { default, options: [...] }` for curated choices or `model: { options: '*' }` for every configured chat model; omitted `default` uses `ai.defaultModel`, and the default is included automatically. `general()` uses `'*'`; override its `model` with a string for one choice, subject to `ai.access.generate`, which hides models a user may not use.

### Initialized Instance

```ts
import { getFrogBot } from 'frogbot';

import config from './frogbot.config';

const frogbot = await getFrogBot({ config });
const posts = await frogbot.find({
  collection: 'posts',
  overrideAccess: true,
  where: {
    status: { equals: 'published' },
  },
  sort: '-createdAt',
});
```

Inside hooks, endpoints, tools, and other request-aware callbacks, use `req.frogbot` and pass the same `req` into nested operations.

## Critical Pitfalls

### Local API Access Control

Local API operations enforce access control by default, for the `user` or `req` they're given (anonymous without one). Pass `overrideAccess` on every call so it says which it is: `true` for trusted server work such as scripts, seeds, jobs and system hooks, and `false` with the user for work done on a user's behalf:

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
  overrideAccess: true,
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
    overrideAccess: true,
    id: doc.id,
    data: { synced: true },
    context: { syncingPost: true },
    req,
  });

  return doc;
};
```

Choose a domain-specific flag and check it before side effects.

## Sharing The App

`npx frogbot share` takes the app live on Dojo and prints its URL. It comes from `dojo()` (`@frogbotai/plugin-dojo`), which new apps list in `plugins`; in an app that doesn't list it, run `npx @frogbotai/plugin-dojo share` instead. Run it from anywhere inside the app when the user asks to share, host, publish or deploy it, or to send someone a link. Suggest it, without running it, when the user wants someone else to try the app or asks how to put it online. Don't share without being asked: it uploads the code and keys.

Your shell has no terminal, so `share` never prompts you. Settle these with the user first:

- **Data.** On the first share, when the app has local records or files, pass `--data` or `--no-data`; without either, `share` stops before sending anything. Ask the user: `--data` brings a copy of the local database and the upload files, including users with their passwords. Only SQLite `file:` databases can bring data. Data comes only with the first share; later shares send code only and never overwrite live data.
- **Keys.** Every key in the `.env` files comes along without asking (`DATABASE_URL`, `FROGBOT_SECRET`, `NODE_ENV`, `PORT` and `HOSTNAME` never do). Leave keys out with `--skip-key NAME` (repeatable, case-sensitive) or `--no-keys`. On later shares, keys whose local value differs from live keep their live value unless you pass `--update-keys`.
- **Workspace and name.** With more than one Dojo workspace, pass `--workspace <slug>`. The address is `https://<name>.frogbot.app`, named from `package.json`; when that's taken, rerun with `--name <another name>`.

The first time, `share` prints `[frogbot] Sign in to Dojo: open this link and confirm the code.`, then the link and the code on their own lines, and waits until the user confirms. Run it where you can read its output while it waits, such as a background shell, and pass the link and code on.

`share` needs a `pnpm-lock.yaml`, `package-lock.json` or `yarn.lock` (not Bun) and an upload under 100 MB. It writes the app's id to `.frogbot/app.json`, so later shares from the folder update the same app; delete that file only when the user wants a new app. It ends with `[frogbot] Share it: <link>` and then the live URL as the last line: give the user both.

When someone shared an app with the user as an editor on Dojo, `npx @frogbotai/plugin-dojo pull <slug>`, run from the folder that should hold it, downloads it into a new `./<slug>` folder with an empty database; then run `pnpm install` and `pnpm dev` there, and `share` from that folder ships a new version of the same app. An editor's share brings no keys and has no `Share it:` line, since only the app's owners manage its keys on Dojo.

When a shared app misbehaves on Dojo, run `npx @frogbotai/plugin-dojo logs <slug>` (or `npx frogbot logs <slug>` in an app that lists `dojo()`) to read its recent logs (key values show as `••••`); add `--follow`, in a background shell, to watch new lines while the user reproduces the problem.

| Exit | Meaning                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| `0`  | Live. The last line is the URL.                                                                              |
| `1`  | Stopped. The last `[frogbot]` line on stderr says why and what to rerun with; fix it or ask the user.        |
| `2`  | Bad flags, such as `--data` with `--no-data` or a `--skip-key` that names no key. Fix the command and rerun. |

On Dojo the app runs as it does with `frogbot start`. Jobs run in the web server, and Dojo wakes a sleeping app when a task or agent schedule is due, so add no worker, external cron or `jobs.access.run` rule for Dojo. Dojo checks `GET /api/health` (`src/app/(frogbot)/api/health/route.ts`, `200` once FrogBot starts, `503` when it can't); keep that route. See the [CLI reference](https://docs.frogbot.ai/getting-started/cli#share).

## Project Layout

```text
src/
├── agents/
│   └── assistant.ts
├── app/
│   └── (frogbot)/
│       ├── [[...segments]]/
│       ├── api/[...slug]/route.ts
│       ├── api/health/route.ts
│       └── layout.tsx
├── collections/
│   ├── Files.ts
│   ├── Posts/
│   │   ├── hooks/
│   │   └── index.ts
│   └── Users.ts
├── frogbot-types.ts
└── frogbot.config.ts
```

Each collection is a TitleCase file with a named export, imported by its own path; when it grows hooks, access rules, or endpoints, move it to `<Name>/index.ts` — the config import doesn't change.

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
