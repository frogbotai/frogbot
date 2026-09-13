# Step 4: Implementation

Proceed after `Approved Step 3` or a clear [request to implement now](FEATURE_DEVELOPMENT_PROCESS.md#when-to-use-this-process), with no unresolved implementation hold. For planned tickets, follow the approved stages and keep `step4_implementation_summary.md` in the local planning folder. Direct work uses the coding, testing, and review rules below without requiring missing planning artifacts or a stage log for a small edit.

## Before implementation

- Read [CONTRIBUTING.md](../../CONTRIBUTING.md), then the ticket's `research.md`, approved plan, relevant contracts, and current owner rulings when present. For direct work, use the owner's request and existing context; do not invent documents or approvals. Confirm the working directory and any ticket workspace setup; create or switch workspaces only when authorized. Record existing worktree and index changes and preserve them.
- All implementation sessions use the same ticket workspace. Pass absolute code/artifact paths; ignored plans are not automatically shared between worktrees. Recheck relevant research claims against changed code, not the entire repository by default.
- The coordinator owns sequencing, shared contracts, the implementation summary, and integration review. Delegate bounded work, not responsibility for the entire ticket.
- Confirm canonical components and API contracts before adding new markup or payloads.

## Subagent scope and reuse

- Scope each implementation session to one cohesive stage or a small cluster in the same domain. Reuse the session for closely related follow-ups, such as a helper, its callers, its tests, and a targeted fix.
- Allow at most **four follow-up assignments (resumes)** after the initial assignment in a session. Start fresh sooner when the domain changes, the work is complete, exploration has made the history large, or repeated failures need a different perspective. This counts coordinator assignments, not the worker's tool calls.
- Do not carry the same session through unrelated backend, admin UI, migration, and documentation stages just because they share a ticket. Reusing the same agent type is fine; reusing its accumulated conversation is the limit.
- Pass a fresh worker a compact handoff, not the full transcript. Preserve accepted contracts and evidence in files so the new worker need not rediscover them.
- Avoid the opposite extreme: do small local edits directly or group related work instead of spawning an agent per file. Fresh sessions have startup and rereading costs; the reuse limit is a project convention, not a guaranteed cost saving.
- Follow stage dependencies. Parallelize only work that is independent and has non-overlapping file ownership; serialize shared-file changes.
- Lint/typecheck always goes to the `lint` subagent. Intermediate workers run only meaningful checks, not repeated full-repository suites against incomplete wiring.

### Assignment and handoff format

Include this information in each new implementation assignment, using focused links and a short summary:

```markdown
- Task: Ticket/stage and one concrete outcome.
- Workspace: Absolute ticket worktree and canonical artifact folder; reuse both.
- Grounding: research.md and a focused reading order; identify changed evidence to recheck.
- Authority: Approved plan/contract paths, relevant rulings, and active holds.
- Scope: Files/domain owned, exclusions, and whether edits are permitted.
- Current state: Relevant completed changes, interfaces to preserve, and known failures.
- Verify: Targeted commands, expected outcomes, and any unavailable dependencies.
- Return: Changed files, checks actually run/results, blockers, and next handoff facts.
- Constraints: Follow CONTRIBUTING.md and applicable package conventions; no unrelated edits or Git actions.
```

Track each session's scope and resume count in the coordinator's working notes or the implementation summary. At handoff, check the diff against the approved contract; do not mark a stage complete solely because the worker says it is done.

## Code readability

Apply the [blank-line rules](../../CONTRIBUTING.md#blank-lines), including in tests. Both worker and coordinator scan edited code for dense walls of text and excessive fragmentation before accepting a handoff. Do not use comments as a substitute for whitespace or compress code to meet a stage-size estimate.

## Stage loop

1. Implement the current stage without changing approved requirements.
2. Run checks that meaningfully apply to the current state. Transitional stages may have only formatting, delegated lint, or focused tests; record which validation awaits named dependent stages. Do not force full suites through knowingly incomplete wiring. Unexpected failures are not excused as transitional without evidence.
3. Review the diff for correctness, shared-contract consistency, readability, and unrelated changes. Rebuild consumed packages before integration smoke tests when required.
4. Update the implementation summary immediately with actual checks and deferred verification. Continue to the next unblocked approved stage without staging, committing, or proposing stage commit messages.
5. On a session boundary, save the compact handoff and dispatch a fresh worker. If new evidence changes scope or architecture, pause affected work and return to the relevant planning gate.

## Dedicated testing stage

Once the ticket's behavior is coherent, execute the testing stage from Step 3. If the owner skipped planning, verify against their request and current contracts instead. Automated tests and fixtures are expected work; they do not require a separate request. Follow the [root test-placement rule](../../CONTRIBUTING.md#verification).

1. Use a fresh verification agent with permission to add or improve tests in the assigned scope. Supply approved requirements, `research.md`, the whole ticket diff including untracked files, actual harness/fixture paths, and relevant contributor rules. Do not give the implementer sole responsibility for declaring its own solution correct.
2. Assert intended behavior through unit, integration, and relevant E2E tests. Exercise real application wiring and observable outcomes, including persisted read-back when relevant; isolated helpers and mocked internal calls are not proof that a journey works.
3. Challenge assumptions with relevant error, boundary, lifecycle, access, retry, and concurrency cases. Use deterministic external fixtures where appropriate; avoid fixed sleeps and unreported reliance on paid/live services. Rebuild consumed packages before testing production-style flows.
4. Cover adjacent regressions. For bugs, show that the regression test exposes the actual pre-fix failure when feasible, not an unrelated setup failure; record when that proof is unavailable. Never destroy the working tree to reconstruct a baseline.
5. Return findings with reproductions and failing assertions to implementation. Fix, rerun affected checks, and repeat until acceptance and adversarial checks pass. Do not weaken assertions, mark failures expected, or skip discovered bugs merely to make the suite green.
6. Record commands, baseline, results, skipped/unavailable checks, and residual risks. Required but blocked tests leave verification incomplete. Then perform the final [verification checks](../../CONTRIBUTING.md#verification); Markdown-only tickets use the documented exception.

## Implementation summary

```markdown
## Stage X — {title}

- Status: Implemented, awaiting ticket verification / verified / blocked / in progress.
- Changes: Files and behavior implemented; do not call uncommitted work released.
- Verification: Commands/manual steps actually run, results, and skips/blockers.
- Review: Contract and readability findings, and their resolution.
- Handoff: Current interfaces, remaining work, and relevant worker session/resume count.
```

## Completion criteria

- All approved stages and acceptance criteria are implemented and verified; unresolved blockers are reported as incomplete work.
- User-facing features are reachable through the normal UI/CLI path, not only a direct URL or isolated test helper. Confirm roles and applicable migration/runtime dependencies.
- Documentation reflects the implemented contract.
- The dedicated acceptance/adversarial/regression stage and applicable final contributor checks pass. Review automatic fixes and rerun affected tests when behavior changes; distinguish required blockers from justified non-applicable checks.
- The coordinator reviews the integrated diff, including spacing and cross-stage behavior, and finalizes the summary.
- Hand off the whole ticket: changes, verification evidence, known risks, and tracked diff plus new untracked files. Plain `git diff` does not show untracked files; never stage them merely to make them visible.

## Git finish

Do not make per-stage commits or prepare per-stage commit messages. Keep work unstaged and uncommitted until explicitly requested, without unstaging pre-existing changes. When authorized, create one final squashed ticket commit and merge into `main`; a single uncommitted ticket needs one commit, not an artificial squash sequence. Each completed F feature remains separate in multi-feature programs.

Before authorized Git actions, inspect status, staged/unstaged changes, and recent commits. Include only intended code, tests, and shared docs; never `.idea/` artifacts. Commit, merge, push, and PR permissions are separate from plan approval. If the owner later manually uncommits on `main` for whole-diff review, address their feedback in the workspace they identify; do not reset history or uncommit on their behalf.
