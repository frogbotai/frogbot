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
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522-brightgreen?style=flat-square" />
</p>

<hr/>

<h4 align="center">
  <a href="#start-with-a-coding-agent"><strong>Start with a coding agent</strong></a>
  &nbsp;·&nbsp;
  <a href="https://docs.frogbot.ai"><strong>Explore the Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><strong>Join the Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="./examples"><strong>Examples</strong></a>
</h4>

<hr/>

**Define your AI agents, tools, providers, and your entire data layer in one typed `frogbot.config.ts` — FrogBot boots the production agent backend for all of it.** No routing code, no glue, no SaaS.

It ships with a full data layer (collections, auth, access control, hooks) and its own embeddable, fully MIT open-source [AI gateway](./packages/gateway).

## Start with a coding agent

Paste this prompt into Codex, Claude Code, Cursor, or another coding agent, and it sets up FrogBot for you. The agent may ask for permission to run commands or use the internet; allow it so the setup can finish. Prefer to do it yourself? Follow the [step-by-step setup](https://docs.frogbot.ai/getting-started/setup).

```text
Help me set up FrogBot, an open-source AI agent app, on this computer. I am not a programmer. Do the work yourself, explain each step in one short sentence, and stop to ask me when you need something from me.

1. Check that Node.js 22 or newer is installed by running node --version. If it is missing or older, give me the link https://nodejs.org/en/download, wait until I say it is installed, then check again.
2. Ask me which AI key I have: OpenAI (the default), Anthropic, or Google. If I have none, send me to https://platform.openai.com/api-keys to create an OpenAI key, and wait.
3. Create the app in my home folder, or in a folder I name, with this command:
npx create-frogbot-app@latest my-frogbot --yes --agents YOUR_AGENT
Replace YOUR_AGENT with the value for the tool you are: codex for Codex, claude for Claude Code, cursor for Cursor, opencode for opencode, copilot for GitHub Copilot, or gemini for Gemini CLI. For an Anthropic key add --ai anthropic; for a Google key add --ai google. This command also installs the FrogBot skill into the project. If a my-frogbot folder already exists there, ask me for another name and use it instead of my-frogbot from here on.
4. Go into the my-frogbot folder and read the FrogBot skill before changing anything. AGENTS.md tells you where it is (CLAUDE.md for Claude Code, GEMINI.md for Gemini CLI, .github/copilot-instructions.md for GitHub Copilot). If the skill is missing, run npx skills add frogbotai/frogbot --skill frogbot --yes in that folder.
5. The app needs my AI provider key in the .env file in my-frogbot (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY). Ask me how I want to set it up.
6. Start the app by running npm run dev in my-frogbot and keep it running. If you cannot keep it running, tell me exactly how to run it myself in a terminal.
7. When it is ready, tell me to open http://localhost:3000 and create my admin account. Then I open Chat, then Chats, in the sidebar and create a new chat to send my first message.

If anything fails, explain the error in plain words and fix it. For FrogBot questions, use the skill first, then https://docs.frogbot.ai/llms.txt.
```

## Why FrogBot

- **One config file** — agents, tools, collections, providers, storage, and email all live in `frogbot.config.ts`
- **Fully typed** — `frogbot generate:types` produces types for your entire config, including your data shapes
- **Auth, access control, and hooks out of the box** — a complete data layer, no separate backend needed
- **Bring your own model** — route to OpenAI, Anthropic, Google, and more through a single self-hosted gateway
- **Streaming built in** — every agent endpoint speaks JSON or SSE, your choice per request
- **No vendor lock-in** — MIT licensed, self-hostable, swap any adapter at any time
- **Deploy anywhere** — Node, serverless, or the edge, with adapters for the databases and storage you already use

## Quickstart

You need Node.js 22 or newer and an [OpenAI API key](https://platform.openai.com/api-keys). Create a project:

```bash
npx create-frogbot-app@latest my-agent
cd my-agent
```

The scaffolder installs dependencies, sets up Git, and writes a `.env` with a generated `FROGBOT_SECRET`. The starter agents run on OpenAI, so they need `OPENAI_API_KEY`: paste your key when the scaffolder asks, or add it to `.env` before you start the app. Pass `--ai anthropic` or `--ai google` to use another provider.

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create your admin account. The dashboard lists your collections; open **Chat → Chats** in the sidebar and select **Create New** to talk to an agent.

That gives you a `users` auth collection, SQLite storage, and two agents (`general` and `assistant`) — no Docker, no external database. New to all this? The [step-by-step setup](https://docs.frogbot.ai/getting-started/setup) explains each step. To call agents from your own code, see the [REST API](https://docs.frogbot.ai/rest-api/overview).

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
      openai: {},
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
- Swappable database, file storage, and KV adapters, with [piece-backed email](https://docs.frogbot.ai/email/overview)

## Packages

This monorepo publishes the following packages:

| Package                                    | Description                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`frogbot`](./packages/frogbot)            | FrogBot core: typed configuration surface, agent runtime, CLI, and HTTP server                                                                     |
| [`@frogbotai/gateway`](./packages/gateway) | The embeddable, self-hostable AI gateway built on the Vercel AI SDK — fully MIT open source. Run it standalone or drop it into any existing server |

**Plugins**

| Package                                                            | Description                                      |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| [`@frogbotai/plugin-api-keys`](./packages/plugins/plugin-api-keys) | Multiple named, independently revocable API keys |

**Database adapters**

| Package                                                          | Description     |
| ---------------------------------------------------------------- | --------------- |
| [`@frogbotai/db-sqlite`](./packages/db-sqlite)                   | SQLite          |
| [`@frogbotai/db-postgres`](./packages/db-postgres)               | Postgres        |
| [`@frogbotai/db-mongodb`](./packages/db-mongodb)                 | MongoDB         |
| [`@frogbotai/db-vercel-postgres`](./packages/db-vercel-postgres) | Vercel Postgres |
| [`@frogbotai/db-d1-sqlite`](./packages/db-d1-sqlite)             | Cloudflare D1   |

**Storage adapters**

| Package                                                            | Description          |
| ------------------------------------------------------------------ | -------------------- |
| [`@frogbotai/storage-s3`](./packages/storage-s3)                   | Amazon S3            |
| [`@frogbotai/storage-r2`](./packages/storage-r2)                   | Cloudflare R2        |
| [`@frogbotai/storage-gcs`](./packages/storage-gcs)                 | Google Cloud Storage |
| [`@frogbotai/storage-azure`](./packages/storage-azure)             | Azure Blob Storage   |
| [`@frogbotai/storage-vercel-blob`](./packages/storage-vercel-blob) | Vercel Blob          |
| [`@frogbotai/storage-uploadthing`](./packages/storage-uploadthing) | UploadThing          |

**Live preview**

| Package                                                          | Description             |
| ---------------------------------------------------------------- | ----------------------- |
| [`@frogbotai/live-preview`](./packages/live-preview)             | JavaScript live preview |
| [`@frogbotai/live-preview-react`](./packages/live-preview-react) | React live preview SDK  |
| [`@frogbotai/live-preview-vue`](./packages/live-preview-vue)     | Vue live preview SDK    |

**Email pieces & KV adapters**

| Package                                                     | Description        |
| ----------------------------------------------------------- | ------------------ |
| [`@frogbotai/piece-resend`](./packages/pieces/piece-resend) | Resend email piece |
| [`@frogbotai/kv-redis`](./packages/kv-redis)                | Redis KV store     |

## Examples

The [`examples/`](./examples) directory shows how to set up FrogBot in different ways:

- [**Simple**](./examples/simple) — the smallest possible setup: one config, one agent, one tool, SQLite. No Docker, no external database.
- [**Tailwind CSS**](./examples/tailwind) — Tailwind CSS 4 in custom admin components without replacing admin base styles.
- [**Business QA**](./examples/business-qa) — a comprehensive release-readiness showcase with authenticated agents, curated integration tools, OAuth, API keys, uploads, and connections.

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

Requires Node ≥ 22 and [pnpm](https://pnpm.io).

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
