# Acme deals: the "FrogBot in 100 seconds" app

The small deals app that the "FrogBot in 100 seconds" video shows on screen: one `deals` collection, an AI router, Acme branding and a Deal Desk agent. Every code step in the video is its own commit with its own `beat-*` tag, so each shot can be revealed with editor undo.

## Versions

| Package                                    | Version                          |
| ------------------------------------------ | -------------------------------- |
| `create-frogbot-app`                       | 0.42.0 (`@latest` on 2026-11-17) |
| `frogbot` and every `@frogbotai/*` package | 0.42.0                           |
| `next`                                     | 16.4.2                           |
| `react`                                    | 19.3.1                           |
| `typescript`                               | 6.0.3                            |
| Node.js / npm                              | 24.22.3 / 11.19.1                |

Scaffolded with `npx create-frogbot-app@latest acme --yes --ai anthropic --agents claude --use-npm` (blank template, SQLite).

## Setup

```bash
npm install
cp .env.example .env    # set FROGBOT_SECRET and ANTHROPIC_API_KEY
npm run seed            # admin@acme.test and sam@acme.test, password acme-demo-password, 10 deals
npm run dev             # http://localhost:3000
```

The seed is for local development only and runs once: it skips users that exist, and adds deals only while the collection is empty. Before `beat-3e` it adds the two users and skips deals. To record beat 2's create-first-user screen, record it before seeding (or with a fresh `frogbot.db`).

## Tags

| Tag        | File on screen                  | What it adds                                                               | Shot                                       |
| ---------- | ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| `scaffold` | —                               | The untouched `create-frogbot-app` output                                  | —                                          |
| `beat-2`   | —                               | Setup commit: seed, brand assets, recording settings, `ai` block reordered | Beat 2: new app, sign-up, chat             |
| `beat-3a`  | `src/collections/Deals.ts`      | `Deals` with `slug` and `name`                                             | Beat 3, press 1                            |
| `beat-3b`  | same                            | `stage` select with colors                                                 | Beat 3, press 2                            |
| `beat-3c`  | same                            | `amount`, `closeDate`, `owner`                                             | Beat 3, press 3                            |
| `beat-3d`  | same                            | `admin` block: title, list and board views                                 | Beat 3, press 4                            |
| `beat-3e`  | `src/frogbot.config.ts`         | `Deals` in `collections`                                                   | Beat 3: table, board drag, `curl`          |
| `beat-4a`  | same                            | `openai` and `bedrock` providers                                           | Beat 4, press 1                            |
| `beat-4b`  | same                            | `fast`/`smart` routers, `defaultModel: 'fast'`                             | Beat 4, press 2                            |
| `beat-4c`  | same                            | `apiKeysPlugin()`                                                          | Beat 4, press 3, then Sam, API key, `curl` |
| `beat-5a`  | same                            | `admin` meta and graphics                                                  | Beat 5, press 1                            |
| `beat-5b`  | `src/app/(frogbot)/custom.scss` | Brand tokens                                                               | Beat 5, press 2, before/after              |
| `beat-6a`  | `src/agents/dealDesk.ts`        | Deal Desk: slug, model, profile, instructions                              | Beat 6, press 1                            |
| `beat-6b`  | `src/tools/deals.ts` + agent    | `findDeals`, `moveDeal`, `tools: [...]`                                    | Beat 6, press 2                            |
| `beat-6c`  | `src/agents/dealDesk.ts`        | Monday `triggers` block                                                    | Beat 6, press 3                            |
| `beat-6d`  | `src/tools/deals.ts`            | `approval: 'required'`                                                     | Beat 6 flash, then the chat                |

Every tag boots with `npm run dev`, loads the admin signed in, and passes `npm run typecheck`. Generated files (`src/frogbot-types.ts`, `src/app/(frogbot)/importMap.js`) are regenerated inside the commit that needs them.

If you have this folder without its git history (for example from the frogbot repo), run `bash video/rebuild-history.sh` to make a copy with every `beat-*` tag. On-screen files match `video/stages/` exactly at each tag.

## Reveal runbook

1. `git checkout beat-3d -- .` so the file is at its finished state for the beat.
2. `.vscode/settings.json` already turns off format-on-save, autosave and the minimap, and sets font size 20. A save that reformats breaks the undo chain.
3. Delete the beat's blocks bottom-up, one selection and Backspace per block (3d, then 3c, then 3b).
4. Start recording. Press Cmd+Z once per block; they come back top-down.
5. If an undo merges two blocks, use the paste fallback: open `video/stages/<tag>/<path>`, Cmd+A and paste each stage in turn into the file, then Cmd+Z / Cmd+Shift+Z jumps between whole stages.

For `custom.scss`, crop the frame to the first four lines: the file keeps going with the rest of the brand tokens.

Before browser shots, dismiss Next.js's orange "1 Insight" badge (bottom left), or it appears in every frame. It is a Next.js dev-mode notice about Next 16.4.2's security advisory.

## Verification results

Run on 2026-11-17 at `beat-6d`, in a cloud container with no AI provider keys.

| #   | Check                                                                           | Result                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Deals list shows the seeded rows; board drag Proposal to Won saves              | **Pass.** 10 rows at `/collections/deals`. Dragging "Globex renewal" to Won on `/collections/deals/board` saved `stage: won` (read back over REST).                                                                                                                                                                              |
| 2   | `curl localhost:3000/api/deals` returns JSON                                    | **Pass** with a session cookie and with an API key (`totalDocs: 10`). Signed out it returns "You are not allowed to perform this action", as expected.                                                                                                                                                                           |
| 3   | Sam shows Models, Monthly Budget (USD), Monthly Spend                           | **Pass.** All three on Sam's page; `monthlyBudget: 50`.                                                                                                                                                                                                                                                                          |
| 4   | Admin-created API key works with `/api/v1/chat/completions`                     | **Not run with a real key.** The key was created in the admin (Create API key, then Generate) and authenticates: `/api/v1/models` lists models, and the completions call reaches the provider step and stops with "The anthropic provider has no API key". A bad key gets `invalid_api_key`. Rerun with `ANTHROPIC_API_KEY` set. |
| 5   | Boots with the `bedrock` line and no AWS credentials                            | **Pass.** No AWS variables were set, not even `AWS_REGION`; the app booted and every page loaded.                                                                                                                                                                                                                                |
| 6   | Acme logo on sign-in, Acme icon in sidebar, "- Acme" titles, indigo buttons     | **Pass.** Logo on `/login`, icon in the sidebar, titles like "Deals - Acme", Login button `rgb(79, 70, 229)`.                                                                                                                                                                                                                    |
| 7   | Deal Desk answers with `find_deals` and sources; Move Initech asks Approve/Deny | **Not run end to end** (needs `ANTHROPIC_API_KEY`). Deal Desk shows in the agent picker with the `smart` model. Called directly, `find_deals` returns Initech, Hooli expansion and Globex renewal with three linked sources, and `move_deal` has `approval: 'required'`.                                                         |
| 8   | `npx frogbot deploy --dry-run` runs                                             | **Pass** (Dojo target): "Upload 63 files (194.4 KB) … nothing was changed". The `docker` target stops on a missing Docker daemon and unwired `prodMigrations`, which beat 7 doesn't need.                                                                                                                                        |

Console errors seen in the admin, none from this app's code:

- A React "unique key" warning from FrogBot's `SettingsNav` on the Users pages. It's present on the untouched scaffold too.
- Gravatar avatar requests failed only because the container blocks that host.

## Changes from the script

- **Scaffold command.** The shot shows `npx create-frogbot-app@latest acme --ai anthropic` with interactive prompts; the repo was made with `--yes --agents claude --use-npm` for the same result without prompts.
- **`ai` block order.** The scaffold writes `defaultModel` before `providers: { anthropic: true }` on one line. The setup commit puts `providers` first, one provider per line, so `beat-4a` and `beat-4b` only add lines and the final block matches the script.
- **`admin` block.** The scaffold's `admin: { meta: { applicationName: 'acme' } }` is replaced by the script's block in `beat-5a`, so `applicationName` is gone. Nothing visible changes: page titles said "- FrogBot" before and "- Acme" after.
- **`custom.scss`.** The script's three tokens are the first lines of `:root`, but `:root` continues with the rest of the light brand set and a `[data-theme='dark']` block, so line 5 isn't `}`.
- **`src/tools/deals.ts`.** The script shows only `moveDeal`. `findDeals` takes `{ stage? }`, returns `id`, `name`, `stage`, `amount` and `closeDate` (the `id` lets the agent call `move_deal` and links the sources), and adds `sources`. `moveDeal`'s `id` is `z.number()` because SQLite IDs are numbers.
- **No `admin.icon` on Deals.** Kept out to match the script, so the sidebar shows a folder and `frogbot check` warns `MISSING_ICON`.
- **Admin paths.** The admin lives at the site root, not `/admin`: Deals is `/collections/deals`, the board is `/collections/deals/board`, Chats is `/collections/chats`.
- **API key button names.** The admin's buttons are "Create API key", then "Generate".
- **Agent picker.** The blank template's `general` and `assistant` agents stay, so the picker lists general, assistant and Deal Desk.
