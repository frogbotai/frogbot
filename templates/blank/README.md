# FrogBot Blank Template

The minimum FrogBot setup: a `users` auth collection, SQLite storage, one
agent, and the admin panel served by Next.js. No Docker, no external database.

The `users` file is an example you can customize, not a framework requirement. Configuring the agent automatically adds `threads` and `messages`; authenticated agent calls persist there, while the anonymous curl below stays stateless.

## Quick Start

This project requires pnpm 10.26 or newer so its approved dependency build scripts run
during installation.

```bash
pnpm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY

pnpm dev
```

FrogBot commands load `.env`, `.env.local`, and mode-specific `.env*` files with Next.js
precedence. Existing shell variables take priority.

Then open [http://localhost:3000/admin](http://localhost:3000/admin) to create
your first user.

## Try it

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello!"}' | jq
```

## Project layout

| Path | Description |
| --- | --- |
| `frogbot.config.ts` | Your FrogBot config — agents, collections, providers |
| `app/(frogbot)/` | Admin panel + API routes (owned by FrogBot, safe to leave alone) |
| `app/(app)/` | Your app — replace the placeholder home page |
| `frogbot-types.ts` | Generated types (`pnpm generate:types`) |

Root `app/` is the standard layout. To use a `src/` layout, move only `app/` to
`src/app/`. Leave `frogbot.config.ts` at the project root; no config, TypeScript alias,
import-map, or type-generation changes are needed.

## Next steps

- Add tools to the agent (`tools: [...]` with a Zod `inputSchema`).
- Add collections (`collections: [...]`) for FrogBot's data layer.
- Swap `sqliteAdapter` for `@frogbotai/db-postgres` or `@frogbotai/db-mongodb`
  when you're ready for a real database.
- Restrict agent `access` (e.g. `({ req }) => !!req.user`) before deploying.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server (`frogbot dev`) |
| `pnpm build` | Production build (`next build`) |
| `pnpm start` | Serve the production build (`frogbot start`) |
| `pnpm generate:types` | Regenerate `frogbot-types.ts` from this config |
| `pnpm generate:importmap` | Regenerate `app/(frogbot)/admin/importMap.js` |
| `pnpm typecheck` | Type-check the project |
