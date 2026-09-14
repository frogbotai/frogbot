# Step 4: Implementation

Proceed after `Approved Step 3` or a clear [request to implement now](FEATURE_DEVELOPMENT_PROCESS.md#when-to-use-this-process), unless an instruction not to implement is still in effect. For planned tickets, follow the approved stages and keep `step4_implementation_summary.md` in the local planning folder. Direct work follows the coding, testing, and review rules below; do not create missing planning documents or a stage log for a small edit.

## Before implementation

- Read [CONTRIBUTING.md](../../CONTRIBUTING.md), then the ticket's `research.md`, approved requirements and plan, and current owner decisions when present. For direct work, use the owner's request and existing context; do not invent documents or approvals. Confirm the working directory; create or switch workspaces only when authorized. Record existing staged and unstaged changes and preserve them.
- All workers use the same ticket workspace. Pass absolute paths to code and ticket documents; ignored plans are not automatically shared between worktrees. Recheck research claims affected by changed code, not the entire repository by default.
- The coordinator decides the work order, keeps shared interfaces consistent, updates the implementation summary, and reviews the combined changes. Give workers specific assignments; do not delegate responsibility for the entire ticket.
- Check existing shared components and API definitions before adding new UI markup or request/response formats.
- **Dependency patches are out of scope.** Follow the [contributor rule](../../CONTRIBUTING.md#when-tests-find-a-problem): report the limitation, continue the agreed application work, and do not expand the architecture to work around the restriction.

## Subagent scope and reuse

- Give each worker one stage or a small group of related tasks. Reuse the session for closely related follow-ups, such as a helper, its callers, its tests, and a targeted fix.
- Allow at most **four follow-up assignments (resumes)** after the initial assignment in a session. Start fresh sooner when the domain changes, the work is complete, exploration has made the history large, or repeated failures need a different perspective. This counts coordinator assignments, not the worker's tool calls.
- Do not carry the same session through unrelated backend, admin UI, migration, and documentation stages just because they share a ticket. Reusing the same agent type is fine; reusing its accumulated conversation is the limit.
- Give a new worker the relevant requirements, current state, and evidence in its assignment, with links to existing ticket documents. Do not pass the full conversation or require a separate handoff file.
- Avoid the opposite extreme: do small local edits directly or group related work instead of spawning an agent per file. Fresh sessions have startup and rereading costs; the reuse limit is a project convention, not a guaranteed cost saving.
- Follow stage dependencies. Run independent assignments in parallel only when workers will not edit the same files. Take turns on shared files.
- Lint/typecheck always goes to the `lint` subagent. Workers run checks relevant to their current changes, not repeated full-repository suites against unfinished work.

### Assignment and handoff format

Include this information in each new implementation assignment, using focused links and a short summary:

```markdown
- Task: Ticket/stage and one concrete outcome.
- Workspace: Absolute code and ticket-document paths; reuse both.
- Read: research.md and the relevant parts of existing documents; identify evidence to recheck.
- Approval: Owner request or approved requirements/plan, relevant decisions, and any work on hold.
- Scope: Files or area assigned, exclusions, and whether edits are permitted.
- Current state: Relevant completed changes, interfaces to preserve, and known failures.
- Verify: Targeted commands, expected outcomes, and any unavailable dependencies.
- Return: A final message with changed files, checks run and results, blockers, and what the next worker needs to know.
- Constraints: Follow CONTRIBUTING.md and applicable package conventions; no unrelated edits or Git actions.
```

This is assignment guidance, not a requirement to create another document. For direct work, leave out planning files that do not exist.

The worker's final message is the default handoff. The coordinator checks its diff and results, then updates the existing implementation summary with lasting decisions, checks, remaining work, and the session's scope and resume count. Do not copy the whole return into the summary or create a file for each worker.

Create a separate handoff file only when a later worker needs substantial detail that would make the summary hard to use—for example, steps to reproduce an unresolved failure or a changed interface several workers must use. First check whether it belongs in an existing ticket document. If a separate file is needed, link it from the summary and update it rather than making successive “final” or “handoff” copies. A new session alone is not a reason to create a file.

## Code readability

Both worker and coordinator must review edited code, including tests, against the [blank-line rules and example](../../CONTRIBUTING.md#blank-lines). A passing formatter does not mean the code is easy to read. Do not use comments as a substitute for whitespace or compress code to meet a stage-size estimate.

## Stage loop

1. Implement the current stage without changing approved requirements.
2. Run checks that apply to the current state. Some stages may need only formatting, delegated lint, or focused tests; record which checks await named later stages. Do not force full suites through knowingly unfinished work. Investigate unexpected failures rather than assuming unfinished work explains them.
3. Review the diff for correctness, consistent use of shared interfaces, readability, and unrelated changes. Rebuild packages before tests that load their built output.
4. Update the existing implementation summary with checks run and checks still needed. Continue to the next unblocked approved stage without staging, committing, or proposing stage commit messages.
5. When starting a new worker, include the necessary current facts in its assignment. If new evidence would change scope or design, pause the affected work and ask for approval of that change.

## Dedicated testing stage

Once the feature's parts work together, run the testing stage from Step 3. If the owner skipped planning, test against their request and existing supported behavior instead. Automated tests and fixtures are expected work; they do not require a separate request. Follow [CONTRIBUTING.md](../../CONTRIBUTING.md#verification) for test placement, repeatable tests, and final checks.

1. Use a fresh agent to check the feature independently, with permission to add or improve tests in the assigned scope. Supply the requirements, existing research, the whole ticket diff including untracked files, paths to the actual test setup and fixtures, and relevant contributor rules. Do not rely only on the implementer's own assessment. Small direct edits can use coordinator review and focused checks instead of a separate testing worker.
2. Test the agreed behavior first. Exercise real application calls and check their results—for example, save a record and read it back. Testing a helper alone does not prove the complete user flow works.
3. Test realistic ways the feature could fail. Choose cases based on how likely they are or how serious the consequences would be, not to maximize the number of failures found. Rare failures can matter; explain which requirement or user risk each case checks.
4. Check related behavior the change might break. For bug fixes, confirm that the test exposes the original failure when feasible, not an unrelated setup error; record when you cannot check this. Never discard working changes to recreate the old code.
5. Use [When tests find a problem](../../CONTRIBUTING.md#when-tests-find-a-problem) to decide what to fix, document, or bring to the owner. Return in-scope failures with reproduction steps, fix them, and rerun the affected checks. Dependency-level fixes remain subject to the no-patches rule above; a newly discovered failure does not authorize a redesign.
6. Record commands, code version tested, results, skipped or unavailable checks, and known limitations in the existing summary. Required but blocked tests leave verification incomplete. Finish the contributor checks; Markdown-only tickets use the documented exception.

## Implementation summary

```markdown
## Stage X — {title}

- Status: Implemented, awaiting ticket verification / verified / blocked / in progress.
- Changes: Files and behavior implemented; do not call uncommitted work released.
- Verification: Commands/manual steps actually run, results, and skips/blockers.
- Review: Requirements and readability findings, and their resolution.
- Remaining work: Needed fixes or checks, decisions to preserve, and relevant worker session/resume count.
```

## Completion criteria

- All approved stages and acceptance criteria are implemented and verified; unresolved blockers are reported as incomplete work.
- User-facing features are reachable through the normal UI/CLI path, not only a direct URL or isolated test helper. Confirm roles and applicable migration/runtime dependencies.
- Documentation describes the implemented behavior and agreed limitations.
- Required tests and final contributor checks pass. Review automatic fixes and rerun affected tests when behavior changes. Distinguish unresolved failures from limitations the owner accepted and checks that do not apply.
- The coordinator reviews the integrated diff, including spacing and cross-stage behavior, and finalizes the summary.
- Hand off the whole ticket: changes, verification evidence, known risks, and tracked diff plus new untracked files. Plain `git diff` does not show untracked files; never stage them merely to make them visible.

## Git finish

Do not make per-stage commits or prepare per-stage commit messages. Keep work unstaged and uncommitted until explicitly requested, without unstaging pre-existing changes. When committing is authorized, create one final ticket commit, not an artificial sequence of commits to squash. Merge into `main` only with separate authorization. Each completed F feature remains separate in multi-feature programs.

Before authorized Git actions, inspect status, staged/unstaged changes, and recent commits. Include only intended code, tests, and shared docs; never `.idea/` artifacts. Commit, merge, push, and PR permissions are separate from plan approval. If the owner later manually uncommits on `main` for whole-diff review, address their feedback in the workspace they identify; do not reset history or uncommit on their behalf.
