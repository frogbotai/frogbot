# How FrogBot is built with agents

The owner decides what gets built. Agents do the research, writing and code. Scripts, hooks and the OpenCode config enforce the rules, so nobody has to remember them.

## Who does what

Each role is an OpenCode agent, except the owner. The commands are the normal path; anything else is an exception.

| Role            | Agent and model                       | Starts when                                                          | Runs                                                                                                                                                                  | Hands back                                                                     | Why it exists                                                                      |
| --------------- | ------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Owner**       | you                                   | any time                                                             | `opencode`, `pnpm ticket decisions`, `pnpm ticket status --batch <n>`, `git push`                                                                                     | issues, card answers, spec approvals, **Go**, pushes                           | decides what gets built; the only one who pushes                                   |
| **Coordinator** | `build`, main model                   | the owner opens a batch                                              | `pnpm ticket next`, `pnpm ticket new <n>`, starts the agents below, `pnpm ticket land <n>` (background shell), `git worktree remove`, `pnpm ticket stats --batch <n>` | a short status per event; cards to the owner                                   | one place that sees every ticket; writes no code, so its context stays small       |
| **Researcher**  | `research`, Sonnet                    | a ticket has an `issue.md`                                           | reads source and the precedent: `~/code/opencode-v2` for agent-harness work, `~/code/payload` for the rest, `pnpm check ticket-docs <n>`                              | `step1_research.md`: facts with `path:line`, no design                         | facts before design, on a cheaper model                                            |
| **Worker**      | `general`, main model, fresh per step | research is done (spec), the spec is approved (plan), **Go** (build) | in its worktree: edits, `pnpm test:unit <file>`, `pnpm test:int:sqlite <file>`, the lint agent, one `git commit`                                                      | `step2_spec.md`, `step3_plan.md`, or one commit plus `step4_implementation.md` | one ticket, from its files, not chat history                                       |
| **Lint agent**  | `lint`, cheap model                   | a worker or the coordinator asks                                     | `pnpm check`, `pnpm check --full`, `pnpm lint:fix`, `pnpm prettier:write`                                                                                             | one line: `check: OK …` or the errors                                          | lint output is long; a cheap model reads it so the worker doesn't                  |
| **Tester**      | `general`, fresh                      | a full-tier ticket is committed                                      | targeted tests that try to break it, then `pnpm ticket verify` on the final commit                                                                                    | bugs found, or "held"; a `verify` ledger row                                   | the worker doesn't grade its own work; batch 27's testers found 2 real bugs in 248 |

Never, for any agent: `git push`, `git merge`, `--no-verify`, sleep loops, whole-suite test runs. Inside a worker also never `git stash` (worktrees share it) or a background call (the plugin refuses both).

### The normal path of a code ticket

1. Coordinator: `pnpm ticket next`, writes `issue.md`.
2. Researcher: `step1_research.md`.
3. Worker: `step2_spec.md` with decision cards. **Owner approves** (`Approve:` in `open_decisions.md`, or in chat).
4. Worker: `step3_plan.md`, at most 3 stages. **Owner says Go** for the batch.
5. Coordinator: `pnpm ticket new <n>`. Worker: builds, commits, logs.
6. Full tier: a tester tries to break it, with at most 2 fix rounds, and ends with `pnpm ticket verify`. Light tier: `pnpm ticket verify`.
7. Coordinator: `pnpm ticket land <n>`. It rebases, runs `check --full`, unit, UI and the int and browser specs the diff touches, squashes, and fast-forwards local `main`; if `main` moves meanwhile it rebases and reruns the gates, and it refuses up front when a Docker service the int specs need is down. Then `git worktree remove`.
8. Owner: skims `main`, pushes.

A process ticket from an approved PLAN skips steps 3 and 4: the PLAN section is its spec (DR-036). "Just do it" skips everything for that scope.

## Life of a ticket

Each ticket is a folder, `.idea/_process/tickets/ticket<n>_<slug>/`, filled in step by step:

| Step   | File                             | What it holds                                     | Owner               |
| ------ | -------------------------------- | ------------------------------------------------- | ------------------- |
| Intake | `issue.md`                       | the problem, its plan, dependencies and batch     | —                   |
| 1      | `step1_research.md`              | facts from source, and how Payload does it        | —                   |
| 2      | `step2_spec.md`                  | what to build, when it's done, decision questions | approves            |
| 3      | `step3_plan.md`                  | files touched, stages and their tests             | says Go (per batch) |
| 4      | code + `step4_implementation.md` | one commit, plus the worker's log                 | skims               |

Stage is read from these files and git, never stored. For small edits the owner says "just do it" and the steps are skipped.

## The guardrails

- **Git hooks** format and lint staged files, refuse `.idea/`, and require Conventional Commit messages.
- **`pnpm check`** is the one static check. It builds what is out of date, then runs format, lint, typecheck of changed workspaces and the repo checks; `--full` covers everything. In the main checkout, `pnpm check ticket-docs [<n>]` checks ticket folders against the templates, `.idea/_process/decisions.md` and PLAN's ticket table, and that every cited `path:line` exists.
- **`pnpm ticket`**:
  - `next` gives a ticket number;
  - `new` creates the worktree and branch;
  - `status` shows every ticket's stage;
  - `decisions` writes the open cards and gates to `.idea/_process/open_decisions.md` and records the owner's answers;
  - `land` rebases, runs the gates, squashes to one commit and fast-forwards local `main`, never pushing. It takes more than 10 minutes when browser specs run, so start it as a background shell and wait for the notification. A docs-only diff skips `test:unit` and `test:ui`, except the unit specs that read Markdown. A known-flaky browser spec (`scripts/lib/flaky.mjs`) is retried once and logged as `flaky` in the ledger;
  - `stats [--batch <n>]` reads `~/.local/share/opencode/opencode.db` (read-only) and shows each ticket's wall and active time, cost, tokens, turns, stage sessions, fix rounds and land attempts;
  - `found [--source <path>] <<'EOF'` reads one `<kind> · <area> · <text>` row from stdin and adds it to `.idea/_process/found.md` with the next free `F-` number. The quoted here-doc keeps backticks from running; text that looks like captured terminal output is refused.
  - `verify [--list]`, in a ticket worktree, maps the diff against local `main` (`scripts/lib/affected.mjs`, the map `land` uses) to typecheck areas, unit, UI, int and browser specs and repo checks, runs them cheapest first, and prints one line per group, the tier and the changed files nothing covers. It writes a `verify` ledger row at the level reached, or `failed`. `--list` prints the set without running it.
- **Ticket keys.** A ticket split into parts uses a letter: `pnpm ticket new 210b` makes `frogbot-ticket210b` and `feat/ticket-210b-<slug>`, and its ledger rows say `210b`.
- **Subagent descriptions** start with the ticket key, for example `211a stage 4: autonumber` or `250 lint: pnpm check`, so `stats` can count the session. A description with no number is fine and counts as "other"; the plugin refuses only one that starts with a number it can't read as a key.
- **OpenCode config and plugin** (`.opencode/`) block `git push`, `git merge`, `--no-verify`, sleep loops, whole-suite test runs, `git stash` while other worktrees exist, and background calls inside subagents, naming what to use instead. They cap resumes, timeouts and output, and flag stalled agents. A failed top-level turn, or any provider sign-in error, raises a macOS notification.

## Where things live

| Path                                                                   | Holds                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `.idea/_process/tickets/`                                              | ticket folders                                                                                                                    |
| `.idea/_process/archive/`                                              | archived tickets (`archive/tickets/`), retired rulings and findings                                                               |
| `.idea/_process/open_decisions.md`                                     | questions waiting for the owner                                                                                                   |
| `.idea/_process/decisions.md`                                          | rulings still in force                                                                                                            |
| `.idea/_process/found.md`                                              | problems found along the way                                                                                                      |
| `.idea/_process/ledger.tsv`                                            | what each verify and land checked                                                                                                 |
| `.github/feature-process/`                                             | a how-to and template for each step: [1](step1_research.md), [2](step2_spec.md), [3](step3_plan.md), [4](step4_implementation.md) |
| [CLAUDE.md](../../CLAUDE.md), [CONTRIBUTING.md](../../CONTRIBUTING.md) | code and agent rules                                                                                                              |

`.idea/` is local and is never committed.

The process itself is committed code:

| What                                                                             | Where                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm ticket` (`new`, `land`, `status`, `stats`, `found`, `decisions`, `verify`) | `scripts/ticket.mjs`, helpers in `scripts/lib/` (`affected.mjs` maps a diff to its tests) |
| heavy-test slots, 3 machine-wide                                                 | `scripts/lib/slot.mjs`, `test/heavySlot.ts`                                               |
| `pnpm check`                                                                     | `scripts/check.mjs`, running each `scripts/check-*.mjs`                                   |
| lint rules                                                                       | `eslint.config.js`, `.oxlintrc.json`, `scripts/eslint-plugin/`                            |
| git hooks                                                                        | `.husky/`, calling `scripts/precommit-guard.mjs` and `scripts/commit-msg.mjs`             |
| agent guardrails                                                                 | `.opencode/opencode.jsonc`, `.opencode/plugins/frogbot/`                                  |
| tests for all of it                                                              | `test/unit/scripts/`, `test/unit/opencode/`                                               |

## Your first batch

1. Run `opencode` in the main checkout and describe the issues.
2. Answer its decision questions and approve each spec.
3. Say **Go**, then watch `pnpm ticket status --batch <n>`.
4. Skim each commit on `main`; push when happy.
5. Close the batch: turn `found.md` into tickets, run the retro.

## Owner gates

Both gates are answered in `.idea/_process/open_decisions.md`:

- an `Approve:` line per spec sets it to `Status: Approved (<date>)`;
- a `Go:` line per batch, once all its plans exist, sets each plan to `Status: Go (<date>)`.

At Go, the coordinator plans the landing lanes from `pnpm ticket status`: tickets in different lanes run together, and tickets in one lane share files or depend on each other, so they land in order.

A new decision card found while planning goes back into the spec and the inbox. Nothing else needs the owner.

## Tiers

A separate tester agent that tries to break every change is slow and costly, and most changes don't need one. So the plan's `touches:` list sorts each ticket into a tier automatically, using the globs in `scripts/ticket.mjs`:

- **Full (high risk):** migrations, collection configs, jobs, uploads, access control, `packages/storage-*` and public package exports. A bug there can corrupt data, leak access or break users' code. A fresh tester agent tries to break the change, with at most 2 fix rounds; anything left over goes to `found.md` through `pnpm ticket found`. The tester finishes with `pnpm ticket verify` on the final commit, and `land` refuses the ticket without that report: a passing ledger row for the current patch-id.
- **Light (everything else):** `pnpm ticket verify`, screenshots from `pnpm ticket verify --ui` that the coordinator checks, and owner spot checks.

## Standing permission

> The batch go covers creating worktrees, using fresh agents, and landing one commit per ticket on local `main` through `pnpm ticket land`. Push, PRs and GitHub writes still need explicit approval.

## Fresh workers

- Every worker starts fresh from the ticket's files. One resume is allowed; more need the owner.
- Every prompt is this one line, with the stage filled in:

  ```text
  Ticket <n>, stage <research|spec|plan|implement|test>. Follow .github/feature-process/README.md and the ticket folder.
  ```

  Standing rules live in [CLAUDE.md](../../CLAUDE.md), the step docs and the plugin, never in the prompt.

- "Just do it" from the owner skips the process for that scope.

## Not built yet

`pnpm ticket verify --ui` (237). Until then the coordinator does it by hand.
