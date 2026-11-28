# FrogBot Blank Template

<!-- ai -->

The minimum FrogBot setup: a `users` auth collection, a `files` upload collection, database
storage, two agents (`general` and `assistant`), and the admin panel served by Next.js. No Docker
is required.

The `src/collections/Users.ts` file is an example you can customize, not a framework requirement.
Configuring the agent automatically adds `chats` and `messages`, where your chats are saved.
`src/collections/Files.ts` defines `files`, the upload collection marked `file: true` that pieces
save files to; see [Files](https://docs.frogbot.ai/upload/files).

<!-- /ai -->
<!-- no-ai -->

The minimum FrogBot setup: a `users` auth collection, a `files` upload collection, database
storage, and the admin panel served by Next.js. No Docker is required.

The `src/collections/Users.ts` file is an example you can customize, not a framework requirement.
`src/collections/Files.ts` defines `files`, the upload collection marked `file: true` that pieces
save files to; see [Files](https://docs.frogbot.ai/upload/files).

<!-- /no-ai -->

## Quick Start

`create-frogbot-app` already wrote a `.env` with a generated `FROGBOT_SECRET`.

<!-- ai -->

Both agents run on the provider you picked (for example OpenAI's `openai/gpt-5.4-mini`). If you
entered an API key, it is already in `.env`; otherwise set it there (for example
`OPENAI_API_KEY=...`) before you start the app.

<!-- /ai -->

FrogBot commands load `.env`, `.env.local`, and mode-specific `.env*` files with Next.js
precedence. Existing shell variables take priority.

Start the dev server. Any package manager works — npm, pnpm, yarn, or bun.

```bash
npm run dev
```

If you created the project with `--no-install`, run `npm install` first. The generated
`package.json` (npm's `allowScripts`) and, with pnpm, `pnpm-workspace.yaml` pre-approve the
dependency install scripts this project needs.

<!-- ai -->

Then open [http://localhost:3000](http://localhost:3000) and create your admin account. The
dashboard lists your collections; open **Chats** in the sidebar and select **Create New** to talk
to an agent.

To call agents from your own code, see the [REST API](https://docs.frogbot.ai/rest-api/overview).

<!-- /ai -->
<!-- no-ai -->

Then open [http://localhost:3000](http://localhost:3000) and create your admin account. The
dashboard lists your collections.

<!-- /no-ai -->

To keep the app running in the background while you or a coding agent edit it, run
`npx frogbot up` instead. It serves a production build that rebuilds on every save, from port
`9696`, and prints its URL; `npx frogbot down` stops it. See the
[CLI reference](https://docs.frogbot.ai/getting-started/cli#run-in-the-background).

## Project layout

| Path                            | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `src/frogbot.config.ts`         | Your FrogBot config — collections, plugins, AI                   |
| `src/collections/`              | The `users` and `files` collections                              |
| `src/app/(frogbot)/`            | Admin panel + API routes (owned by FrogBot, safe to leave alone) |
| `src/app/(frogbot)/api/health/` | Health check, `GET /api/health`, for hosting                     |
| `src/frogbot-types.ts`          | Generated types (the `generate:types` script)                    |

To use a root layout instead, move everything out of `src/` and update the `@/*` and
`@frogbot-config` paths in `tsconfig.json`. No config, import-map, or type-generation changes are
needed — both layouts are detected automatically.

## Next steps

- Add collections (`collections: [...]`) for FrogBot's data layer.
- Choose PostgreSQL or MongoDB with `create-frogbot-app --db` when creating a project.
- Put it online with `npx frogbot deploy`, or run the included `Dockerfile` anywhere; see
  [Deployment](https://docs.frogbot.ai/deployment/overview).

<!-- ai -->

Give the agents tools (`tools: [...]` with a Zod `inputSchema`), and restrict agent `access` (for
example `({ req }) => !!req.user`) before deploying.

<!-- /ai -->

<!-- no-ai -->

## Add an AI provider

This project was created with `--ai none`, so it has no agents or AI configuration. Follow the
[AI overview](https://docs.frogbot.ai/ai/overview) when you are ready to add one.

<!-- /no-ai -->

## Scripts

| Script               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `dev`                | Start the Next.js dev server (`frogbot dev`)       |
| `build`              | Production build (`next build`)                    |
| `start`              | Serve the production build (`frogbot start`)       |
| `generate:types`     | Regenerate `src/frogbot-types.ts` from this config |
| `generate:importmap` | Regenerate `src/app/(frogbot)/importMap.js`        |
| `format`             | Format the project with Prettier                   |
| `typecheck`          | Type-check the project                             |
