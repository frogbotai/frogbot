# FrogBot Blank Template

The minimum FrogBot setup: a `users` auth collection, SQLite storage, one
agent, and the admin panel served by Next.js. No Docker, no external database.

The `users` file is an example you can customize, not a framework requirement. Configuring the agent automatically adds `threads` and `messages`; authenticated agent calls persist there, while the anonymous curl below stays stateless.

## Quick Start

Any package manager works — npm, pnpm, yarn, or bun.

```bash
npm install
npm run dev
```

On pnpm 10.26 or newer, the generated `pnpm-workspace.yaml` pre-approves the
dependency build scripts this project needs.

`create-frogbot-app` already wrote a `.env` with a generated `FROGBOT_SECRET`, and
the default `assistant` agent runs on opencode Zen's free
`zen/deepseek-v4-flash-free` — no API key needed. Swap the provider in
`src/frogbot.config.ts` for openai, anthropic, google, etc. when you're ready.

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

| Path                    | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `src/frogbot.config.ts` | Your FrogBot config — agents, collections, providers             |
| `src/app/(frogbot)/`    | Admin panel + API routes (owned by FrogBot, safe to leave alone) |
| `src/app/(app)/`        | Your app — replace the placeholder home page                     |
| `src/frogbot-types.ts`  | Generated types (`npm run generate:types`)                       |

To use a root layout instead, move everything out of `src/` and update the
`@/*` and `@frogbot-config` paths in `tsconfig.json`. No config, import-map, or
type-generation changes are needed — both layouts are detected automatically.

## Next steps

- Add tools to the agent (`tools: [...]` with a Zod `inputSchema`).
- Add collections (`collections: [...]`) for FrogBot's data layer.
- Swap `sqliteAdapter` for `@frogbotai/db-postgres` or `@frogbotai/db-mongodb`
  when you're ready for a real database.
- Restrict agent `access` (e.g. `({ req }) => !!req.user`) before deploying.

## Scripts

| Script               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `dev`                | Start the Next.js dev server (`frogbot dev`)       |
| `build`              | Production build (`next build`)                    |
| `start`              | Serve the production build (`frogbot start`)       |
| `generate:types`     | Regenerate `src/frogbot-types.ts` from this config |
| `generate:importmap` | Regenerate `src/app/(frogbot)/admin/importMap.js`  |
| `typecheck`          | Type-check the project                             |
