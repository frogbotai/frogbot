# How FrogBot is built with agents

The owner decides what gets built. Agents do the research, writing and code. Scripts, hooks and the OpenCode config enforce the rules, so nobody has to remember them.

## Who does what

- **Owner.** Files issues, answers decision questions, approves specs, says **Go** once per batch, skims what lands, and is the only one who pushes.
- **Coordinator.** One OpenCode session (the `build` agent) that runs a batch: it starts fresh agents, reviews their work and lands it. It writes no code.
- **Workers.** A fresh `general` agent per step or stage, starting from the ticket's files, not chat history.
- **Lint agent.** A cheap model that runs `pnpm check`.
- **Tester.** A fresh agent that tries to break a risky ticket before it lands.

## Life of a ticket

Each ticket is a folder, `.idea/tickets/ticket<n>_<slug>/`, filled in step by step:

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
- **`pnpm check`** is the one static check. It builds what is out of date, then runs format, lint, typecheck of changed workspaces and the repo checks; `--full` covers everything.
- **`pnpm ticket`**:
  - `next` gives a ticket number;
  - `new` creates the worktree and branch;
  - `status` shows every ticket's stage;
  - `land` rebases, runs the gates, squashes to one commit and fast-forwards local `main`, never pushing.
- **OpenCode config and plugin** (`.opencode/`) block `git push`, `git merge`, `--no-verify`, sleep loops and whole-suite test runs, naming what to use instead. They cap resumes, timeouts and output, and flag stalled agents.

## Where things live

| Path                                                                   | Holds                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `.idea/tickets/`                                                       | ticket folders                                                                                                                    |
| `.idea/decisions/OPEN.md`                                              | questions waiting for the owner                                                                                                   |
| `.idea/decisions.md`                                                   | rulings still in force                                                                                                            |
| `.idea/found.md`                                                       | problems found along the way                                                                                                      |
| `.idea/ledger.tsv`                                                     | what each land verified                                                                                                           |
| `.github/feature-process/`                                             | a how-to and template for each step: [1](step1_research.md), [2](step2_spec.md), [3](step3_plan.md), [4](step4_implementation.md) |
| [CLAUDE.md](../../CLAUDE.md), [CONTRIBUTING.md](../../CONTRIBUTING.md) | code and agent rules                                                                                                              |

`.idea/` is local and is never committed.

## Your first batch

1. Run `opencode` in the main checkout and describe the issues.
2. Answer its decision questions and approve each spec.
3. Say **Go**, then watch `pnpm ticket status --batch <n>`.
4. Skim each commit on `main`; push when happy.
5. Close the batch: turn `found.md` into tickets, run the retro.

## Owner gates

Both gates are answered in `.idea/decisions/OPEN.md`:

- an `Approve:` line per spec sets it to `Status: Approved (<date>)`;
- a `Go:` line per batch, once all its plans exist, sets each plan to `Status: Go (<date>)`.

A new decision card found while planning goes back into the spec and the inbox. Nothing else needs the owner.

## Tiers

The plan's `touches:` list is matched against globs in `scripts/ticket.mjs`.

- **Full** if any path matches migrations, `collections/config`, `jobs`, `uploads`, access files, `packages/storage-*` or `packages/*/src/exports`: a fresh tester, at most 2 fix rounds, leftovers to `.idea/found.md`.
- **Light** otherwise: `pnpm ticket verify`, `pnpm ticket verify --ui` screenshots the coordinator looks at, and owner sampling.

## Standing permission

> The batch go covers creating worktrees, using fresh agents, and landing one commit per ticket on local `main` through `pnpm ticket land`. Push, PRs and GitHub writes still need explicit approval.

## Fresh workers

- Every worker starts fresh from the ticket's files. One resume is allowed; more need the owner.
- "Just do it" from the owner skips the process for that scope.

## Not built yet

`pnpm ticket decisions` (223), `pnpm check ticket-docs` (222), and `pnpm ticket verify [--ui]` (236, 237). Until then the coordinator does these by hand.
