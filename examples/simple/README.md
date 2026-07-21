# FrogBot Example: Basic Agent

The smallest possible FrogBot setup: one `frogbot.config.ts`, one agent, one
tool, and SQLite for storage. No Docker, no external database, no admin UI —
just a running HTTP server you can `curl`.

This mirrors how [Payload's `examples/`](https://github.com/payloadcms/payload/tree/main/examples)
work, scoped down to a single starting example for FrogBot core.

## Quick Start

From this directory:

```bash
pnpm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY

set -a && source .env && set +a
pnpm dev
```

You should see:

```
[frogbot] dev mode — watching for config changes
[frogbot] Ready on http://localhost:3000
[frogbot] REST API: http://localhost:3000/api
```

## Try it

Ask the agent something:

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -d '{"prompt":"What time is it in Tokyo?"}' | jq
```

Stream the response instead (SSE):

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"prompt":"Tell me a short joke."}'
```

List registered agents:

```bash
curl -s http://localhost:3000/api/agents | jq
```

## How it works

Everything lives in [`frogbot.config.ts`](./frogbot.config.ts):

- **`db`** — `sqliteAdapter` from `@frogbotai/db-sqlite`, pointed at a local
  file (`frogbot.db`). Swap in `@frogbotai/db-postgres` or
  `@frogbotai/db-mongodb` for real deployments.
- **`ai.providers`** — one provider (`openai`) configured with an API key.
  Add more providers here as needed.
- **`agents`** — a single agent (`assistant`) with a model, instructions, and
  one tool (`get_time`). FrogBot registers `GET /api/agents` and
  `POST /api/agents/:slug` automatically — you never write routing code.
- **`collections`** — a single `users` auth collection, the minimum FrogBot
  example for customizing authentication. FrogBot can supply its default user
  collection when none is configured. The agent also injects `threads` and
  `messages`; authenticated calls persist automatically, while this example's
  anonymous calls stay stateless.

The `access: () => true` on the agent is dev-only — it makes `curl` work
without authentication. Restrict it (e.g. `({ req }) => !!req.user`) before
deploying anywhere real.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Boot the server with file-watching (`frogbot dev`) |
| `pnpm start` | Boot the server without watching (`frogbot start`) |
| `pnpm generate:types` | Regenerate `frogbot-types.ts` from this config |
| `pnpm typecheck` | Type-check `frogbot.config.ts` |

## Next steps

- Add a real collection (`collections: [...]`) — see `test/frogbot-instance/`.
- Add more tools to the agent, or more agents to `agents: [...]`.
- Swap `sqliteAdapter` for `@frogbotai/db-postgres` or `@frogbotai/db-mongodb`
  when you're ready for a real database.
- Point `db.client.url` at a persistent volume, or set `DATABASE_URL` in your
  deployment environment.
