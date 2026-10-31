<p align="center">
  <a href="https://www.frogbot.ai"><img src="./.github/assets/frogbot-logo.svg" width="120" alt="FrogBot logo" /></a>
</p>

<h1 align="center">FrogBot</h1>

<p align="center"><strong>The open-source lego bricks for AI to build and replace SaaS apps</strong></p>

<p align="center">
  <a href="https://github.com/frogbotai/frogbot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/frogbot"><img alt="npm" src="https://img.shields.io/npm/v/frogbot?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/frogbot"><img alt="npm downloads" src="https://img.shields.io/npm/dw/frogbot?style=flat-square" /></a>
  &nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><img alt="Discord" src="https://img.shields.io/badge/Discord-join%20chat-5865F2?logo=discord&logoColor=white&style=flat-square" /></a>
  &nbsp;
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A524.21-brightgreen?style=flat-square" />
</p>

<hr/>

<h4 align="center">
  <a href="#start-with-a-coding-agent"><strong>Start with a coding agent</strong></a>
  &nbsp;·&nbsp;
  <a href="#quickstart"><strong>Quickstart</strong></a>
  &nbsp;·&nbsp;
  <a href="https://docs.frogbot.ai"><strong>Explore the Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><strong>Join the Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="./examples"><strong>Examples</strong></a>
</h4>

<hr/>

**Define AI agents, tools, providers, 40+ integrations, and your entire data layer in one typed `frogbot.config.ts` — FrogBot boots the production Admin UI, database, and HTTP server for all of it.** No routing code, no glue, no per-seat SaaS tax.

Prompting an AI from scratch produces 15,000 lines of fragile glue code for auth, tables, permissions, and background queues. FrogBot gives your coding agent established, declarative building blocks in one MIT-licensed TypeScript codebase you own forever.

## Start with a coding agent

Paste this prompt into Claude Code, Cursor, Codex, or OpenCode to scaffold a FrogBot app with the bundled [FrogBot skill](https://docs.frogbot.ai/skills/coding-agents):

```text
Set up a new FrogBot app on this machine and help me build with it:

1. Verify Node.js >= 24.21 (node --version). If missing, give me https://nodejs.org/en/download and wait.
2. Ask which AI provider key I want to use (openai, anthropic, or google) and where to create the project folder.
3. Run: npx create-frogbot-app@latest my-frogbot --yes --ai <PROVIDER> --agents <AGENT>
   (Use claude, codex, cursor, opencode, copilot, or gemini for <AGENT>.)
4. Read the installed FrogBot skill inside my-frogbot (.claude/skills/frogbot/SKILL.md or .agents/skills/frogbot/SKILL.md) before editing any files.
5. Help me add my provider API key to my-frogbot/.env, start the dev server (npm run dev), and open http://localhost:3000.
6. Ask what app or SaaS tool I want to build or replace, then configure collections, views, pieces, and agents in src/frogbot.config.ts.
```

## Quickstart

You need Node.js 24.21 or newer and an AI provider key ([OpenAI](https://platform.openai.com/api-keys), Anthropic, or Google). Create and boot a project:

```bash
npx create-frogbot-app@latest my-app --ai openai
cd my-app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to create your admin account, view your collections, and open **Chats** to talk to your agent. See [Installation](https://docs.frogbot.ai/getting-started/installation) for every CLI flag.

## How it works

Everything lives in one typed configuration file—database collections, Admin UI views, AI providers, tools, and agents:

```ts
// frogbot.config.ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import type { Tool } from 'frogbot';
import { z } from 'zod';

const lookupDealSchema = z.object({
  dealId: z.string().describe('The deal ID to look up.'),
});

const lookupDeal: Tool<typeof lookupDealSchema> = {
  slug: 'lookup_deal',
  description: 'Fetch a deal record using the signed-in user permissions.',
  inputSchema: lookupDealSchema,
  execute: ({ dealId }, ctx) =>
    ctx.frogbot.findByID({
      collection: 'deals',
      id: dealId,
      req: ctx.req,
      overrideAccess: false,
    }),
};

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: 'file:./frogbot.db' } }),
  collections: [
    {
      slug: 'deals',
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'stage',
          type: 'select',
          options: ['lead', 'qualified', 'proposal', 'won'],
          defaultValue: 'lead',
        },
        { name: 'value', type: 'number' },
      ],
    },
  ],
  ai: {
    providers: {
      openai: {},
    },
  },
  agents: [
    {
      slug: 'assistant',
      model: 'openai/gpt-4.1-mini',
      instructions: 'You are FrogBot, a concise sales and operations assistant.',
      tools: [lookupDeal],
      access: ({ req }) => !!req.user,
    },
  ],
});
```

Boot locally with `frogbot dev`, generate end-to-end TypeScript types with `frogbot generate:types`, or deploy to the cloud in one command with `npx frogbot share`.

## Features

- **Full data layer & Admin UI** — collections, fields, auth, access control, versions, drafts, and hooks, with instant Table, Kanban board, and Calendar views
- **Config-first AI agents** — typed [Zod](https://zod.dev) tool schemas, per-agent and per-request access control functions, and server-owned chat history
- **Automatic REST & streaming endpoints** — every agent (`POST /api/agents/:slug`) and collection (`/api/:slug`) gets instant HTTP endpoints with JSON and SSE streaming
- **Embeddable MIT AI gateway** — route to OpenAI, Anthropic, Google, and 30+ more providers through one self-hosted [AI gateway](./packages/gateway)
- **40+ native OAuth pieces & chat channels** — connect Slack, Discord, Linear, GitHub, Teams, Telegram, Gmail, Stripe, Notion, Xero, and more with managed OAuth and human-in-the-loop channel approvals
- **Durable jobs & schedules** — background queues, cron schedules, retries, and workers backed by your database
- **Single-command type generation** — `frogbot generate:types` produces end-to-end TypeScript types for your collections, agents, and pieces
- **Own & deploy anywhere** — MIT licensed; swap SQLite, Postgres, or MongoDB and S3/R2/GCS/Azure/Vercel Blob adapters anytime, or deploy in one command with `npx frogbot share`

## Packages

This monorepo publishes the following packages:

| Package                                                      | Description                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [`frogbot`](./packages/frogbot)                              | FrogBot core: typed configuration surface, collections, agent runtime, jobs, CLI, and HTTP server |
| [`create-frogbot-app`](./packages/create-frogbot-app)        | CLI scaffolder for new FrogBot apps and coding-agent skills                                       |
| [`@frogbotai/next`](./packages/next)                         | Next.js App Router integration for the Admin UI, REST API, and GraphQL endpoints                  |
| [`@frogbotai/ui`](./packages/ui)                             | React UI components, Table/Kanban/Calendar views, and Chat UI library                             |
| [`@frogbotai/gateway`](./packages/gateway)                   | Embeddable, self-hostable MIT AI gateway built on the Vercel AI SDK                               |
| [`@frogbotai/sdk`](./packages/sdk)                           | Typed client SDK for calling FrogBot APIs from external frontends and services                    |
| [`@frogbotai/protocol`](./packages/protocol)                 | Zero-dependency types contract shared by the FrogBot server and its clients                       |
| [`@frogbotai/richtext-lexical`](./packages/richtext-lexical) | Lexical rich-text editor and field adapter                                                        |
| [`@frogbotai/graphql`](./packages/graphql)                   | GraphQL helper types and schema generator CLI                                                     |

**Plugins**

| Package                                                                      | Description                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`@frogbotai/plugin-dojo`](./packages/plugins/plugin-dojo)                   | One-command cloud deploy (`frogbot share`), `pull`, and `logs`        |
| [`@frogbotai/plugin-roles`](./packages/plugins/plugin-roles)                 | Role-based access control (RBAC) collections and permission helpers   |
| [`@frogbotai/plugin-audit-log`](./packages/plugins/plugin-audit-log)         | Immutable audit trail for collection and auth operations              |
| [`@frogbotai/plugin-mcp`](./packages/plugins/plugin-mcp)                     | Expose collections and tools as a Model Context Protocol (MCP) server |
| [`@frogbotai/plugin-ai-policy`](./packages/plugins/plugin-ai-policy)         | Per-user model allowlists and monthly AI budgets                      |
| [`@frogbotai/plugin-api-keys`](./packages/plugins/plugin-api-keys)           | Multiple named, independently revocable API keys                      |
| [`@frogbotai/plugin-capture`](./packages/plugins/plugin-capture)             | Capture AI calls and export JSONL chat training data                  |
| [`@frogbotai/plugin-usage-reports`](./packages/plugins/plugin-usage-reports) | AI token and cost usage reporting                                     |
| [`@frogbotai/plugin-import-export`](./packages/plugins/plugin-import-export) | CSV and JSON collection import and export                             |
| [`@frogbotai/plugin-stripe`](./packages/plugins/plugin-stripe)               | Stripe webhooks and billing sync                                      |
| [`@frogbotai/plugin-nested-docs`](./packages/plugins/plugin-nested-docs)     | Hierarchical parent/child document trees and breadcrumbs              |
| [`@frogbotai/plugin-redirects`](./packages/plugins/plugin-redirects)         | URL redirect management collection                                    |
| [`@frogbotai/plugin-seo`](./packages/plugins/plugin-seo)                     | SEO metadata fields and preview helpers                               |
| [`@frogbotai/plugin-sentry`](./packages/plugins/plugin-sentry)               | Sentry error reporting integration                                    |

**Pieces (40+ Integrations & Channels)**

See [`packages/pieces`](./packages/pieces) for all 40 native integrations, including [`@frogbotai/piece-slack`](./packages/pieces/piece-slack), [`@frogbotai/piece-discord`](./packages/pieces/piece-discord), [`@frogbotai/piece-linear`](./packages/pieces/piece-linear), [`@frogbotai/piece-github`](./packages/pieces/piece-github), [`@frogbotai/piece-microsoft-teams`](./packages/pieces/piece-microsoft-teams), [`@frogbotai/piece-telegram-bot`](./packages/pieces/piece-telegram-bot), [`@frogbotai/piece-gmail`](./packages/pieces/piece-gmail), [`@frogbotai/piece-google-sheets`](./packages/pieces/piece-google-sheets), [`@frogbotai/piece-notion`](./packages/pieces/piece-notion), [`@frogbotai/piece-airtable`](./packages/pieces/piece-airtable), [`@frogbotai/piece-stripe`](./packages/pieces/piece-stripe), [`@frogbotai/piece-xero`](./packages/pieces/piece-xero), and [`@frogbotai/piece-resend`](./packages/pieces/piece-resend).

**Database adapters**

| Package                                                          | Description     |
| ---------------------------------------------------------------- | --------------- |
| [`@frogbotai/db-sqlite`](./packages/db-sqlite)                   | SQLite          |
| [`@frogbotai/db-postgres`](./packages/db-postgres)               | Postgres        |
| [`@frogbotai/db-mongodb`](./packages/db-mongodb)                 | MongoDB         |
| [`@frogbotai/db-vercel-postgres`](./packages/db-vercel-postgres) | Vercel Postgres |
| [`@frogbotai/db-d1-sqlite`](./packages/db-d1-sqlite)             | Cloudflare D1   |

**Storage, KV, Image & Live Preview adapters**

| Package                                                            | Description                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`@frogbotai/storage-s3`](./packages/storage-s3)                   | Amazon S3                                                                          |
| [`@frogbotai/storage-r2`](./packages/storage-r2)                   | Cloudflare R2                                                                      |
| [`@frogbotai/storage-gcs`](./packages/storage-gcs)                 | Google Cloud Storage                                                               |
| [`@frogbotai/storage-azure`](./packages/storage-azure)             | Azure Blob Storage                                                                 |
| [`@frogbotai/storage-vercel-blob`](./packages/storage-vercel-blob) | Vercel Blob                                                                        |
| [`@frogbotai/kv-redis`](./packages/kv-redis)                       | Redis KV store                                                                     |
| [`@frogbotai/transformer-sharp`](./packages/transformer-sharp)     | Image resizing and optimization (Sharp)                                            |
| [`@frogbotai/live-preview`](./packages/live-preview)               | Live preview core (`@frogbotai/live-preview-react`, `@frogbotai/live-preview-vue`) |

## Examples

The [`examples/`](./examples) directory shows how to set up FrogBot in different ways:

- [**Simple**](./examples/simple) — the smallest possible setup: one config, one agent, one tool, SQLite. No Docker, no external database.
- [**Tailwind CSS**](./examples/tailwind) — Tailwind CSS 4 in custom admin components without replacing admin base styles.
- [**Business QA**](./examples/business-qa) — a comprehensive showcase with authenticated agents, curated integration tools, OAuth, API keys, uploads, and connections.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Integration tests run against real databases via Docker:

```bash
pnpm docker:start
pnpm test:int:sqlite   # or test:int:pg / test:int:mongo
```

Requires Node ≥ 24.21 and [pnpm](https://pnpm.io).

## Contributing

Contributions are welcome! Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR, keep changes focused, and make sure `pnpm check` and relevant tests pass.

## Need help?

- [Documentation](https://docs.frogbot.ai)
- [Discord](https://discord.com/invite/JBZF7syAnU)
- [GitHub Issues](https://github.com/frogbotai/frogbot/issues)
- [GitHub Discussions](https://github.com/frogbotai/frogbot/discussions)

## License

[MIT](./LICENSE) © Colby Gilbert
