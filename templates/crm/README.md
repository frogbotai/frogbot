# FrogBot CRM Template

A basic CRM for a small sales team: companies with logos, contacts, a deals pipeline from lead to
won or lost, a calendar of calls, meetings and demos, and tasks. Every collection opens in the views
that suit it, such as a board, a list or a calendar. An `assistant` agent knows the layout, and a
**Load sample data** panel fills an empty CRM so you can see each view. It runs on SQLite,
PostgreSQL or MongoDB. No Docker is required.

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

## Views

| Collection | Views                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Companies  | A list, and a board by lifecycle with each company's logo on its card |
| Contacts   | A list                                                                |
| Deals      | A board by stage, from lead to won or lost, and a list                |
| Activities | A calendar of calls, meetings, demos and events, and a list           |
| Tasks      | A list, a board by status, and a calendar by due date                 |

Each collection's views are in its file in `src/collections/`, under `admin.views`.

## Sample data

In development, the dashboard shows a **Load sample data** panel. Its button calls
`POST /api/seed`, which adds eight fictional companies with logos, their contacts and deals, a
week of activities around today, and a few tasks. Everything is assigned to you.

- It only adds records, and only while companies, contacts, deals, activities and tasks are all
  empty. Otherwise it answers `409` and changes nothing.
- It creates no login and never deletes anything.
- With `NODE_ENV=production`, as in `npm run start` and the Dockerfile, the panel renders nothing
  and the endpoint answers `404`.

To remove the sample data, delete its records in the admin panel. To remove the feature, delete
`src/seed/` and `src/components/SeedPanel.tsx`, then remove `seedEndpoint()` and the `SeedPanel`
entry from `src/frogbot.config.ts` and run `npm run generate:importmap`.

## Project layout

| Path                            | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `src/frogbot.config.ts`         | Your FrogBot config — agents, collections, providers             |
| `src/collections/`              | Companies, contacts, deals, activities, tasks, users and media   |
| `src/seed/`                     | The sample data, its logos and the `POST /api/seed` endpoint     |
| `src/components/SeedPanel.tsx`  | The dashboard panel with the sample data button                  |
| `src/agents/`                   | The `assistant` agent (removed with `--ai none`)                 |
| `src/app/(frogbot)/`            | Admin panel + API routes (owned by FrogBot, safe to leave alone) |
| `src/app/(frogbot)/api/health/` | Health check, `GET /api/health`, for hosting                     |
| `src/frogbot-types.ts`          | Generated types (`npm run generate:types`)                       |

## Next steps

- Add the stages your team uses to the deal `stage` select; the board gets a column for each.
- Restrict who can see and edit records with collection `access` before deploying.
- Put it online with `npx frogbot share`; see [`share`](https://docs.frogbot.ai/getting-started/cli#share).

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
