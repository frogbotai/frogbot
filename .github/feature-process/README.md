# Feature process

Planned ticket work runs in four stages, each written by a fresh agent into the ticket folder `.idea/tickets/ticket<n>_<slug>/`. Small, direct edits don't need it. Code, test and git rules live in [CONTRIBUTING.md](../../CONTRIBUTING.md); agent rules in [CLAUDE.md](../../CLAUDE.md).

## Stages

| Stage       | File in the ticket folder                                         | Written by             | Owner                         |
| ----------- | ----------------------------------------------------------------- | ---------------------- | ----------------------------- |
| Intake      | `issue.md`                                                        | coordinator            | —                             |
| 1 Research  | [`step1_research.md`](step1_research.md)                          | fresh research agent   | —                             |
| 2 Spec      | [`step2_spec.md`](step2_spec.md)                                  | fresh drafter          | **Spec approval**, per ticket |
| 3 Plan      | [`step3_plan.md`](step3_plan.md)                                  | fresh planner          | **Batch go**, once per batch  |
| 4 Implement | [`step4_implementation.md`](step4_implementation.md) (log) + code | fresh worker per stage | samples landed commits        |

Each linked doc is the how-to and template for its file. `issue.md` links its PLAN section and has a `Depends on:` line (ticket numbers or `none`) and a `Batch:` line (a number, `none` or `deferred`).

`pnpm ticket` arrives with tickets 218, 223 and 236–237, and `pnpm check ticket-docs` with ticket 222.

## Owner gates

Both gates are answered in `.idea/decisions/OPEN.md`:

- an `Approve:` line per spec, which sets the spec to `Status: Approved (<date>)`;
- a `Go:` line per batch, once all its plans exist, which sets each plan to `Status: Go (<date>)`.

Nothing else needs the owner, except a new decision card found while planning: it goes back into the spec and the inbox.

Stage is never stored. `pnpm ticket status` reads it from which step files exist, the spec's `Status: Draft|Approved (<date>)`, the plan's `Status: Draft|Go (<date>)`, and git (branch, worktree, merged into `main`).

## Tiers

The plan's `touches:` list is matched against globs in `scripts/ticket.mjs`.

- **Full** if any path matches migrations, `collections/config`, `jobs`, `uploads`, access files, `packages/storage-*` or `packages/*/src/exports`: a fresh tester, at most 2 fix rounds, leftovers to `.idea/found.md`.
- **Light** otherwise: `pnpm ticket verify`, `pnpm ticket verify --ui` screenshots the coordinator looks at, and owner sampling. No tester.

## Standing permission

> The batch go covers creating worktrees, using fresh agents, and landing one commit per ticket on local `main` through `pnpm ticket land`. Push, PRs and GitHub writes still need explicit approval.

## Fresh workers

- Every worker starts fresh from the ticket's files. One resume is allowed; more need the owner.
- "Just do it" from the owner skips the process for that scope.

## How a batch runs

1. Intake writes each `issue.md`; `pnpm ticket next` gives the number.
2. Research, then spec. Each drafter runs `pnpm check ticket-docs` before returning.
3. `pnpm ticket decisions` writes the inbox, the owner answers, and a rerun records the answers.
4. Plans.
5. The owner writes `Go:`. The coordinator takes lanes from `pnpm ticket status --batch <n>`, at most 3–4 at once.
6. Per ticket: `pnpm ticket new <n>`, a fresh worker per stage told "follow `step3_plan.md`", verify by tier, `pnpm ticket land <n>`.
7. Close: empty `.idea/found.md`, move rulings that a hook, lint rule or check now enforces out of `.idea/decisions.md`, and run the batch retro.
