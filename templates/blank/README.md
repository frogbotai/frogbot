# FrogBot Blank Template

The minimum FrogBot setup: a `users` auth collection, SQLite storage, and one
agent. No Docker, no external database.

## Quick Start

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

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello!"}' | jq
```

## Next steps

- Add tools to the agent (`tools: [...]` with a Zod `inputSchema`).
- Add collections (`collections: [...]`) for FrogBot's data layer.
- Swap `sqliteAdapter` for `@frogbotai/db-postgres` or `@frogbotai/db-mongodb`
  when you're ready for a real database.
- Restrict agent `access` (e.g. `({ req }) => !!req.user`) before deploying.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Boot the server with file-watching (`frogbot dev`) |
| `pnpm start` | Boot the server without watching (`frogbot start`) |
| `pnpm generate:types` | Regenerate `frogbot-types.ts` from this config |
| `pnpm typecheck` | Type-check `frogbot.config.ts` |
