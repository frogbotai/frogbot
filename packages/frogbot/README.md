<p align="center">
  <a href="https://www.frogbot.ai"><img src="https://raw.githubusercontent.com/frogbotai/frogbot/main/.github/assets/frogbot-logo.svg" width="110" alt="FrogBot logo" /></a>
</p>

<h1 align="center">FrogBot</h1>

<p align="center"><strong>The open-source lego bricks for AI to build and replace SaaS apps.</strong></p>

<p align="center">
  <a href="https://github.com/frogbotai/frogbot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/frogbot"><img alt="npm" src="https://img.shields.io/npm/v/frogbot?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/frogbot"><img alt="npm downloads" src="https://img.shields.io/npm/dw/frogbot?style=flat-square" /></a>
  &nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><img alt="Discord" src="https://img.shields.io/badge/Discord-join%20chat-5865F2?logo=discord&logoColor=white&style=flat-square" /></a>
</p>

<hr/>

<h4 align="center">
  <a href="https://docs.frogbot.ai"><strong>Explore the Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><strong>Join the Discord</strong></a>
</h4>

<hr/>

Define AI agents, tools, providers, 40+ integrations, and your entire data layer in one typed `frogbot.config.ts` — then boot a production Admin UI, database, and HTTP server with REST APIs for all of it. No routing code, no glue, no per-seat SaaS tax.

## Quickstart

Scaffold a full app with the CLI (or add `frogbot` to an existing project):

```bash
npx create-frogbot-app@latest my-app --ai openai
```

```ts
// frogbot.config.ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

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
      model: 'openai/gpt-4.1-mini',
      instructions: 'You are FrogBot, a concise and friendly assistant.',
      access: ({ req }) => !!req.user,
    },
  ],
});
```

```bash
frogbot dev
```

FrogBot registers `GET /api/agents` and `POST /api/agents/:slug` automatically. Every agent endpoint speaks JSON or SSE streaming, your choice per request:

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello!"}'
```

## Features

- Config-first agents with typed [Zod](https://zod.dev) tool schemas
- Automatic REST endpoints for every agent, with JSON and SSE streaming responses
- Per-agent access control functions, down to the request level
- Full data layer & Admin UI: collections, fields, auth, versions, drafts, hooks, plus instant Table, Kanban board, and Calendar views
- An embeddable, fully MIT open-source [AI gateway](https://www.npmjs.com/package/@frogbotai/gateway) routing to OpenAI, Anthropic, Google, and 30+ more providers
- 40+ native OAuth pieces & chat channels (Slack, Discord, Linear, GitHub, Gmail, Stripe, Notion, Xero, and more)
- Durable jobs queue, cron schedules, and background workers
- Single-command type generation (`frogbot generate:types`) for end-to-end type safety
- Dev mode with config file watching (`frogbot dev`), production mode with `frogbot start`, and one-command cloud deploy with `npx frogbot share`
- Swappable [database](https://www.npmjs.com/package/@frogbotai/db-postgres), [file storage](https://www.npmjs.com/package/@frogbotai/storage-s3), and [KV](https://www.npmjs.com/package/@frogbotai/kv-redis) adapters, with [piece-backed email](https://docs.frogbot.ai/email/overview) through [Resend](https://www.npmjs.com/package/@frogbotai/piece-resend)

## CLI

| Command                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `frogbot dev`            | Boot the server with config file watching       |
| `frogbot start`          | Boot the server for production                  |
| `frogbot generate:types` | Generate `frogbot-types.ts` from your config    |
| `frogbot share`          | Deploy your app and data to Dojo in one command |

## Documentation

Full documentation lives at [docs.frogbot.ai](https://docs.frogbot.ai). For a complete working project, see the [simple example](https://github.com/frogbotai/frogbot/tree/main/examples/simple).

## License

[MIT](https://github.com/frogbotai/frogbot/blob/main/LICENSE) © Colby Gilbert
