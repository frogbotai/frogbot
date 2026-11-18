# Mow Money: the "FrogBot in 100 seconds" app

The app the "FrogBot in 100 seconds" video builds on screen: Mow Money, a lawn-mowing business that outgrows its whiteboard. It has one `lawn-jobs` collection, an AI router, Edge Lords Lawn Care white-labeling and a Foreman agent. Every code step in the video is its own commit with its own `beat-*` tag, so each shot can be revealed with editor undo.

## Versions

| Package                                    | Version                          |
| ------------------------------------------ | -------------------------------- |
| `create-frogbot-app`                       | 0.42.0 (`@latest` on 2026-11-18) |
| `frogbot` and every `@frogbotai/*` package | 0.42.0                           |
| `next`                                     | 16.4.2                           |
| `react`                                    | 19.3.1                           |
| `typescript`                               | 6.0.3                            |
| Node.js / npm                              | 24.22.3 / 11.19.1                |

Scaffolded with `npx create-frogbot-app@latest mow-money --yes --ai anthropic --agents claude --use-npm` (blank template, SQLite).

## Setup

```bash
npm install
cp .env.example .env    # set FROGBOT_SECRET and ANTHROPIC_API_KEY
npm run seed            # ray@mowmoney.test and tyler@mowmoney.test, password mow-money-demo, 10 jobs
npm run dev             # http://localhost:3000
```

The seed is for local development only and runs once: it skips users that exist, and adds jobs only while the collection is empty. Before `beat-6d` it adds the two users and skips jobs. To record beat 5's sign-up screen, record it before seeding (or with a fresh `frogbot.db`).

Seeded jobs include "Mrs. Patel, front yard" and "The Hendersons" (Scheduled), and three jobs that are Mowed but not Paid, for the Monday summary.

## Tags

| Tag        | File on screen                  | What it adds                                              | Shot                                         |
| ---------- | ------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `scaffold` | —                               | The untouched `create-frogbot-app` output                 | —                                            |
| `beat-5`   | —                               | Setup commit: seed, Edge Lords assets, recording settings | Beat 5: new app, sign-up, chat               |
| `beat-6a`  | `src/collections/Jobs.ts`       | `Jobs` with `slug` and `customer`                         | Beat 6, press 1                              |
| `beat-6b`  | same                            | `price` and the `stage` select                            | Beat 6, press 2                              |
| `beat-6c`  | same                            | `admin` block with list and board views                   | Beat 6, press 3                              |
| `beat-6d`  | `src/frogbot.config.ts`         | `Jobs` in `collections`                                   | Beat 6: table, board drag, `curl`            |
| `beat-7a`  | same                            | `openai` and `bedrock` providers                          | Beat 7, press 1                              |
| `beat-7b`  | same                            | `fast`/`smart` routers, `defaultModel: 'fast'`            | Beat 7, press 2                              |
| `beat-7c`  | same                            | `apiKeysPlugin()`                                         | Beat 7, press 3, then Tyler, API key, `curl` |
| `beat-8a`  | same                            | `admin` meta and graphics                                 | Beat 8, press 1                              |
| `beat-8b`  | `src/app/(frogbot)/custom.scss` | Brand tokens                                              | Beat 8, press 2, then the wipe               |
| `beat-9a`  | `src/agents/foreman.ts`         | Foreman: slug, model, profile, instructions               | Beat 9, press 1                              |
| `beat-9b`  | `src/tools/jobs.ts` + agent     | `findJobs`, `cancelJob`, `tools: [...]`                   | Beat 9, press 2                              |
| `beat-9c`  | `src/agents/foreman.ts`         | Monday `triggers` block                                   | Beat 9, press 3                              |
| `beat-9d`  | `src/tools/jobs.ts`             | `approval: 'required'`                                    | Beat 9, press 4, then the chat               |

Every tag boots with `npm run dev`, loads the admin signed in, and passes `npm run typecheck`. Generated files (`src/frogbot-types.ts`, `src/app/(frogbot)/importMap.js`) are regenerated inside the commit that needs them.

Beat 10's database swap has no tag, because the app must keep running on SQLite. `video/stages/beat-10/src/frogbot.config.ts` is `beat-9d` with the `postgresAdapter` line (and its import). It typechecks with `@frogbotai/db-postgres` installed; to boot it you also need a Postgres `DATABASE_URL`.

If you have this folder without its git history (for example from the frogbot repo), run `bash video/rebuild-history.sh` to make a copy with every `beat-*` tag. On-screen files match `video/stages/` exactly at each tag.

## Reveal runbook

1. `git checkout beat-6c -- .` so the file is at its finished state for the beat.
2. `.vscode/settings.json` already turns off format-on-save, autosave and the minimap, and sets font size 20. A save that reformats breaks the undo chain.
3. Delete the beat's blocks bottom-up, one selection and Backspace per block (6c, then 6b).
4. Start recording. Press Cmd+Z once per block; they come back top-down.
5. If an undo merges two blocks, use the paste fallback: open `video/stages/<tag>/<path>`, Cmd+A and paste each stage in turn into the file, then Cmd+Z / Cmd+Shift+Z jumps between whole stages.

For beat 10, open `src/frogbot.config.ts`, select the `db:` line and paste the line from `video/stages/beat-10`, then undo and redo between them.

For `custom.scss`, crop the frame to the first four lines: the file keeps going with the rest of the brand tokens.

Before browser shots:

- Dismiss Next.js's orange "1 Insight" badge (bottom left), or it appears in every frame. It is a Next.js dev-mode notice about Next 16.4.2's security advisory.
- Record the browser at 1920 wide. At 1440 the board's fourth column (Paid) is cut off.
- For beat 8's wipe, record the "before" board at `beat-7c` (FrogBot green) and the "after" board at `beat-8b` (Edge Lords orange).

## Verification results

Run on 2026-11-18 at `beat-9d`, in a cloud container with no AI provider keys.

| Check                                                                                        | Result                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs list shows the seeded rows; board drag Scheduled to Mowed saves                         | **Pass.** 10 rows at `/collections/lawn-jobs`. Dragging "Mrs. Patel, front yard" to Mowed on `/collections/lawn-jobs/board` saved `stage: mowed` (read back over REST).                                                                   |
| `curl localhost:3000/api/lawn-jobs` returns JSON                                             | **Pass** with an API key (`totalDocs: 10`). Signed out it returns "You are not allowed to perform this action", as expected.                                                                                                              |
| Tyler shows Models, Monthly Budget (USD), Monthly Spend                                      | **Pass.** All three on Tyler's page; `monthlyBudget: 20`.                                                                                                                                                                                 |
| Admin-created API key works with `/api/v1/chat/completions`                                  | **Not run with a real key.** The key was created in the admin (Create API key, then Generate) and authenticates; the completions call stops at "The anthropic provider has no API key". Rerun with `ANTHROPIC_API_KEY` set.               |
| Boots with the `bedrock` line and no AWS credentials                                         | **Pass.** No AWS variables were set; every tag from `beat-7a` booted.                                                                                                                                                                     |
| Edge Lords logo on sign-in, icon in sidebar, "- Edge Lords Lawn Care" titles, orange buttons | **Pass.** Login button `rgb(234, 88, 12)`.                                                                                                                                                                                                |
| Foreman: "Cancel the Hendersons" shows Approve/Deny; Monday list of unpaid jobs              | **Not run end to end** (needs `ANTHROPIC_API_KEY`). Foreman shows in the agent picker. Called directly, `find_jobs` with `stage: 'mowed'` returns the three unpaid jobs with linked sources, and `cancel_job` has `approval: 'required'`. |
| `npx frogbot deploy --dry-run` runs                                                          | **Pass** (Dojo target): "Upload 63 files … nothing was changed".                                                                                                                                                                          |

Console errors seen in the admin, none from this app's code: a React "unique key" warning from FrogBot's `SettingsNav` on the Users pages (present on the untouched scaffold too), and Gravatar requests that failed only because the container blocks that host.

## Changes from the script

- **Slug `lawn-jobs`, not `jobs`.** FrogBot reserves `jobs` for its jobs API (`Collection slug 'jobs' is reserved for the jobs API`). The file is still `Jobs.ts` and the export still `Jobs`; the sidebar says "Lawn Jobs" and the REST call is `curl localhost:3000/api/lawn-jobs`.
- **SQLite line keeps `|| ''`.** `sqliteAdapter({ client: { url: process.env.DATABASE_URL } })` fails typecheck because `url` must be a string, so the line is `url: process.env.DATABASE_URL || ''`. The setup commit puts it on one line so beat 10 swaps one line. The Postgres line runs as written.
- **Beat 10 also swaps the import.** `postgresAdapter` comes from `@frogbotai/db-postgres`, so the snapshot changes the first import too.
- **Scaffold command.** The shot shows `npx create-frogbot-app@latest mow-money --ai anthropic` with prompts; the repo used `--yes --agents claude --use-npm` for the same result without prompts.
- **`ai` block order.** The setup commit puts `providers` first, one per line, so `beat-7a` and `beat-7b` only add lines and the final block matches the script.
- **`admin` block.** The scaffold's `admin: { meta: { applicationName: 'mow-money' } }` is replaced by the script's block in `beat-8a`.
- **`custom.scss`.** The script's three tokens are the first lines of `:root`, which continues with the rest of the light brand set and a `[data-theme='dark']` block.
- **`src/tools/jobs.ts`.** The script shows only `cancelJob`. `findJobs` takes `{ stage? }`, returns `id`, `customer`, `stage` and `price` (the `id` lets the agent call `cancel_job` and links the sources), and adds `sources`. `cancelJob`'s `id` is `z.number()` because SQLite IDs are numbers.
- **No `admin.icon` on Jobs.** Kept out to match the script, so the sidebar shows a folder and `frogbot check` warns `MISSING_ICON`.
- **Setup changes to scaffold files.** `layout.tsx` uses `return await`, and `package.json` drops the scaffold's direct dependency on the upstream SQLite driver (`@frogbotai/db-sqlite` installs it), so the app passes the frogbot repo's lint and branding checks.
- **Admin paths and buttons.** The admin lives at the site root: `/collections/lawn-jobs`, `/collections/lawn-jobs/board`, `/collections/chats`. The API key buttons are "Create API key", then "Generate".
- **Agent picker.** The blank template's `general` and `assistant` agents stay, so the picker lists general, assistant and Foreman.
