# FrogBot Projects Template

A small project tracker: projects, tasks with keys such as `WEB-12` on a board grouped by status
and on a timeline from start to due date, an `assistant` agent that knows the layout, and a **Seed your database** button that loads sample
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

## Roles

Every user has a role, set in the **Roles** field of their user record. The first account, the one
you create on an empty app, is an admin. Users an admin adds are members unless the admin picks
another role.

| Role    | Can                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin   | Everything, and the only role that adds, removes or changes the role of users                                                                                                      |
| Manager | Create, edit and delete projects, tasks and files, and read the audit log                                                                                                          |
| Member  | Read everything, create tasks, which are assigned to them, and edit only tasks assigned to them. Only admins and managers reassign a task. Members upload files and delete nothing |

Everyone can edit their own name, email and password. The rules are in `src/roles.ts`; change them
there.

## Import a CSV

Open projects or tasks and choose **Import**. Pick a CSV, such as an export from Asana, Airtable or
a spreadsheet, and match each column to a field. A task's project column links to a project by
name, and **Create missing** adds the projects that don't exist yet. The preview shows each row
before you start, and the import runs as you, so your role's rules apply. **Export** in the same
place downloads a CSV or JSON file.

See [Import and export](https://docs.frogbot.ai/plugins/import-export) for the details.

## Audit log

Every create, update and delete in the app is saved to **Audit Logs**, with who made it, when, and
which fields changed. Admins and managers can read it; nobody can edit it.

## Project layout

| Path                            | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `src/frogbot.config.ts`         | Your FrogBot config — agents, collections, providers             |
| `src/collections/Projects.ts`   | Projects, each with a key such as `WEB`                          |
| `src/collections/Tasks.ts`      | Tasks with numbered keys, a list, a board and a timeline         |
| `src/roles.ts`                  | The roles and who can do what                                    |
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
- Add a role, such as a read-only `viewer`, in `src/roles.ts`.
- Put it online with `npx frogbot deploy`, on Dojo, or on Docker, Fly.io, Google Cloud, AWS or Azure; see [Deployment](https://docs.frogbot.ai/deployment/overview).

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
