<p align="center">
  <a href="https://www.frogbot.ai"><img src="./.github/assets/frogbot-logo.svg" width="120" alt="FrogBot logo" /></a>
</p>

<h1 align="center">FrogBot</h1>

<p align="center"><strong>The config-first AI agent framework</strong></p>

<p align="center">
  <a href="https://github.com/frogbotai/frogbot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/frogbot"><img alt="npm" src="https://img.shields.io/npm/v/frogbot?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/frogbot"><img alt="npm downloads" src="https://img.shields.io/npm/dw/frogbot?style=flat-square" /></a>
  &nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><img alt="Discord" src="https://img.shields.io/badge/Discord-join%20chat-5865F2?logo=discord&logoColor=white&style=flat-square" /></a>
  &nbsp;
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen?style=flat-square" />
</p>

<hr/>

<h4 align="center">
  <a href="https://docs.frogbot.ai"><strong>Explore the Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><strong>Join the Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="./examples"><strong>Examples</strong></a>
</h4>

<hr/>

**Define your AI agents, tools, providers, and your entire data layer in one typed `frogbot.config.ts` — FrogBot boots the production agent backend for all of it.** No routing code, no glue, no SaaS.

It ships with a full data layer (collections, auth, access control, hooks) and its own embeddable, fully MIT open-source [AI gateway](./packages/gateway) built on the [Vercel AI SDK](https://ai-sdk.dev) — the server side of what Vercel kept closed-source.

## Why FrogBot

- **One config file** — agents, tools, collections, providers, storage, and email all live in `frogbot.config.ts`
- **Fully typed** — `frogbot generate:types` produces types for your entire config, including your data shapes
- **Auth, access control, and hooks out of the box** — a complete data layer, no separate backend needed
- **Bring your own model** — route to OpenAI, Anthropic, Google, and more through a single self-hosted gateway
- **Streaming built in** — every agent endpoint speaks JSON or SSE, your choice per request
- **No vendor lock-in** — MIT licensed, self-hostable, swap any adapter at any time
- **Deploy anywhere** — Node, serverless, or the edge, with adapters for the databases and storage you already use

## Quickstart

Scaffold a project and talk to a real agent in under a minute:

```bash
npx create-frogbot-app my-agent
cd my-agent
pnpm install
cp .env.example .env   # set OPENAI_API_KEY
pnpm dev
```

That gives you a `users` auth collection, SQLite storage, and one agent — no Docker, no external database. Then talk to it:

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello!"}'
```

## How it works

Everything lives in one file. Define an agent with a tool, pick a database, and you're done:

```ts
// frogbot.config.ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import type { Tool } from 'frogbot';
import { z } from 'zod';

const getTimeSchema = z.object({
  timezone: z.string().optional().describe('An IANA timezone. Defaults to UTC.'),
});

const getTime: Tool<typeof getTimeSchema> = {
  slug: 'get_time',
  description: 'Get the current date and time.',
  inputSchema: getTimeSchema,
  execute: ({ timezone }) => ({
    iso: new Date().toISOString(),
    timezone: timezone ?? 'UTC',
  }),
};

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: 'file:./frogbot.db' } }),
  ai: {
    providers: {
      openai: { apiKey: process.env.OPENAI_API_KEY! },
    },
  },
  agents: [
    {
      slug: 'assistant',
      model: 'openai/gpt-4o-mini',
      instructions: 'You are FrogBot, a concise and friendly assistant.',
      tools: [getTime],
      access: ({ req }) => !!req.user,
    },
  ],
});
```

Boot it with `frogbot dev`, then send a request to `POST /api/agents/:slug`. Ask for `accept: text/event-stream` to stream instead. FrogBot registers `GET /api/agents` and `POST /api/agents/:slug` automatically — you never write routing code.

See the [simple example](./examples/simple) for the full walkthrough.

## Features

- Config-first agents with typed [Zod](https://zod.dev) tool schemas
- Automatic REST endpoints for every agent, with JSON and SSE streaming responses
- Per-agent access control functions, down to the request level
- Full data layer: collections, fields, auth, versions, drafts, and hooks
- An embeddable, fully MIT open-source AI gateway with a unified `provider/model` catalog across vendors
- Single-command type generation (`frogbot generate:types`) for end-to-end type safety
- Dev mode with config file watching (`frogbot dev`), production mode with `frogbot start`
- Adapter-based everything — database, file storage, email, and KV are all swappable

## Packages

This monorepo publishes the following packages:

| Package | Description |
| --- | --- |
| [`frogbot`](./packages/frogbot) | FrogBot core: typed configuration surface, agent runtime, CLI, and HTTP server |
| [`@frogbotai/gateway`](./packages/gateway) | The embeddable, self-hostable AI gateway built on the Vercel AI SDK — fully MIT open source. Run it standalone or drop it into any existing server |

**Database adapters**

| Package | Description |
| --- | --- |
| [`@frogbotai/db-sqlite`](./packages/db-sqlite) | SQLite |
| [`@frogbotai/db-postgres`](./packages/db-postgres) | Postgres |
| [`@frogbotai/db-mongodb`](./packages/db-mongodb) | MongoDB |
| [`@frogbotai/db-vercel-postgres`](./packages/db-vercel-postgres) | Vercel Postgres |
| [`@frogbotai/db-d1-sqlite`](./packages/db-d1-sqlite) | Cloudflare D1 |

**Storage adapters**

| Package | Description |
| --- | --- |
| [`@frogbotai/storage-s3`](./packages/storage-s3) | Amazon S3 |
| [`@frogbotai/storage-r2`](./packages/storage-r2) | Cloudflare R2 |
| [`@frogbotai/storage-gcs`](./packages/storage-gcs) | Google Cloud Storage |
| [`@frogbotai/storage-azure`](./packages/storage-azure) | Azure Blob Storage |
| [`@frogbotai/storage-vercel-blob`](./packages/storage-vercel-blob) | Vercel Blob |
| [`@frogbotai/storage-uploadthing`](./packages/storage-uploadthing) | UploadThing |

**Email & KV adapters**

| Package | Description |
| --- | --- |
| [`@frogbotai/email-nodemailer`](./packages/email-nodemailer) | Nodemailer |
| [`@frogbotai/email-resend`](./packages/email-resend) | Resend |
| [`@frogbotai/kv-redis`](./packages/kv-redis) | Redis KV store |

## Examples

The [`examples/`](./examples) directory shows how to set up FrogBot in different ways:

- [**Simple**](./examples/simple) — the smallest possible setup: one config, one agent, one tool, SQLite. No Docker, no external database.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Integration tests run against real databases via Docker:

```bash
pnpm docker:start <profile> up -d
pnpm test:int:sqlite   # or test:int:pg / test:int:mongo
```

Requires Node ≥ 20 and [pnpm](https://pnpm.io).

## Contributing

Contributions are welcome! Read through existing patterns in the codebase before opening a PR, keep changes focused, and make sure `pnpm test`, `pnpm lint`, and `pnpm typecheck` pass.

## Need help?

- [Documentation](https://docs.frogbot.ai)
- [Discord](https://discord.com/invite/JBZF7syAnU)
- [GitHub Issues](https://github.com/frogbotai/frogbot/issues)
- [GitHub Discussions](https://github.com/frogbotai/frogbot/discussions)

## Like what we're doing? Give us a star

## License

[MIT](./LICENSE) © Colby Gilbert
