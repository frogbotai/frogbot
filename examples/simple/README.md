# FrogBot Example: Basic Agent

The smallest full FrogBot app: one `frogbot.config.ts`, one agent, one tool,
SQLite for storage, and the admin panel served by Next.js. No Docker, no
external database.

## Quick Start

From this directory:

```bash
pnpm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY

pnpm dev
```

FrogBot commands load `.env*` files automatically.

Then open [http://localhost:3000/admin](http://localhost:3000/admin) to create
your first user and browse the admin panel.

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

Your config lives in [`frogbot.config.ts`](./frogbot.config.ts):

- **`db`** — `sqliteAdapter` from `@frogbotai/db-sqlite`, pointed at a local
  file (`frogbot.db`). Swap in `@frogbotai/db-postgres` or
  `@frogbotai/db-mongodb` for real deployments.
- **`ai.providers`** — one provider (`openai`) configured with an API key.
  Add more providers here as needed.
- **`agents`** — a single agent (`assistant`) with a model, instructions, and
  one tool (`get_time`). FrogBot registers `GET /api/agents` and
  `POST /api/agents/:slug` automatically — you never write routing code.
- **`collections`** — a single `users` auth collection, the minimum FrogBot
  example for customizing authentication. The agent also injects `threads` and
  `messages`; authenticated calls persist automatically, while this example's
  anonymous calls stay stateless.

The `app/(frogbot)/` directory is the Next.js scaffold that serves everything:

| Path | Description |
| --- | --- |
| `app/(frogbot)/admin/` | The admin panel (catch-all route + import map) |
| `app/(frogbot)/api/[...slug]/` | The REST API, including agent endpoints |
| `app/(frogbot)/api/ai/[...slug]/` | The OpenAI-compatible AI gateway |
| `app/(app)/` | Your app — replace the placeholder home page |

The `access: () => true` on the agent is dev-only — it makes `curl` work
without authentication. Restrict it (e.g. `({ req }) => !!req.user`) before
deploying anywhere real.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server (`frogbot dev`) |
| `pnpm build` | Production build (`next build`) |
| `pnpm start` | Serve the production build (`frogbot start`) |
| `pnpm generate:types` | Regenerate `frogbot-types.ts` from this config |
| `pnpm generate:importmap` | Regenerate `app/(frogbot)/admin/importMap.js` |
| `pnpm typecheck` | Type-check the project |

## Next steps

- Add a real collection (`collections: [...]`) — see `test/frogbot-instance/`.
- Add more tools to the agent, or more agents to `agents: [...]`.
- Swap `sqliteAdapter` for `@frogbotai/db-postgres` or `@frogbotai/db-mongodb`
  when you're ready for a real database.
- Point `db.client.url` at a persistent volume, or set `DATABASE_URL` in your
  deployment environment.
- No Next.js? See `examples/standalone` for mounting FrogBot's handlers in
  your own server (no admin panel).
