# FrogBot Projects Template

A small project tracker: projects, tasks with keys such as `WEB-12` on a board grouped by status,
an `assistant` agent that knows the layout, and a **Seed your database** button that loads sample
data. It runs on SQLite, PostgreSQL or MongoDB. No Docker is required.

## Quick Start

`create-frogbot-app` already wrote a `.env` with a generated `FROGBOT_SECRET`. If you picked an AI
provider and entered an API key, it is in `.env` too; otherwise set it there (for example
`OPENAI_API_KEY=...`) before you start the app.

FrogBot commands load `.env`, `.env.local`, and mode-specific `.env*` files with Next.js
precedence. Existing shell variables take priority.

Start the dev server. Any package manager works — npm, pnpm, yarn, or bun.

```bash
npm run dev
```

If you created the project with `--no-install`, run `npm install` first. On pnpm 10.26 or newer,
the generated `pnpm-workspace.yaml` pre-approves the dependency build scripts this project needs.

Then open [http://localhost:3000](http://localhost:3000) and create your admin account.

## Sample data

While the app has no projects, the dashboard shows a **Seed your database** panel. Its button
calls `POST /api/seed`, which adds three projects with tasks, every task assigned to you. It
creates no user and deletes nothing: once a project exists, the panel hides and the endpoint
answers `409`. To start over locally, delete the database.

The seed is plain code in `src/seed/index.ts`; edit it to change the sample data.

## Project layout

| Path                            | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `src/frogbot.config.ts`         | Your FrogBot config — agents, collections, providers             |
| `src/collections/Projects.ts`   | Projects, each with a key such as `WEB`                          |
| `src/collections/Tasks.ts`      | Tasks with numbered keys, a list view and a board view           |
| `src/seed/`                     | The sample data and the `POST /api/seed` endpoint                |
| `src/components/SeedPanel.tsx`  | The dashboard panel, shown while the app has no projects         |
| `src/components/SeedButton.tsx` | The panel's seed button                                          |
| `src/agents/`                   | The `assistant` agent (removed with `--ai none`)                 |
| `src/app/(frogbot)/`            | Admin panel + API routes (owned by FrogBot, safe to leave alone) |
| `src/app/(frogbot)/api/health/` | Health check, `GET /api/health`, for hosting                     |
| `src/frogbot-types.ts`          | Generated types (`npm run generate:types`)                       |

## Next steps

- Add fields to tasks, such as a priority select, and show them on the board with
  `defaultFields`.
- Restrict who can edit projects with collection `access` before deploying.
- Put it online with `npx frogbot share`; see [`dojo apps share`](https://docs.frogbot.ai/getting-started/cli#dojo-apps-share).

## Add an AI provider

Projects created with `--ai none` omit the agents and AI configuration. Follow the
[AI overview](https://docs.frogbot.ai/ai/overview) when you are ready to add one.

## Scripts

| Script               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `dev`                | Start the Next.js dev server (`frogbot dev`)       |
| `build`              | Production build (`next build`)                    |
| `start`              | Serve the production build (`frogbot start`)       |
| `generate:types`     | Regenerate `src/frogbot-types.ts` from this config |
| `generate:importmap` | Regenerate `src/app/(frogbot)/importMap.js`        |
| `typecheck`          | Type-check the project                             |
