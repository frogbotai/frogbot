# Feature development process

Feature work starts by understanding the request and assigning research, then follows four steps: agree on the outcome, agree on the approach, approve the plan, and implement and test it. Read this overview and the current step only; read later steps when authorized. Do not reprint these instructions.

## When to use this process

- Use this process for planned feature and ticket work. Small, direct edits do not need a ticket or planning documents.
- If the owner says “just do the work now,” “skip planning,” or gives another clear instruction to proceed, implement the named scope without waiting for planning approvals. The owner may also skip specific steps. Do not create missing research or plan files merely to unlock implementation, and do not claim skipped steps were approved.
- Still inspect the relevant code, follow contributor conventions, and verify the change. Ask only about missing details that would materially change the result, not whether the owner really meant to skip the process.
- A clear instruction to resume implementation of the same work lifts its earlier planning-only hold. A plan approval or unrelated request does not. If the scope is unclear, clarify it.
- These exceptions apply to every step below. They do not grant permission to stage, commit, merge, push, open a PR, or change branch/worktree setup. Existing Git permissions remain unchanged.

## Instructions and ticket documents

- This directory contains the shared process instructions. [CONTRIBUTING.md](../../CONTRIBUTING.md) defines coding, architecture, testing, and contribution rules; [CLAUDE.md](../../CLAUDE.md) tells agents which guides to read.
- Keep ticket documents in a dedicated local `.idea/{feature_name}/` folder, or an existing `.idea/tickets/{ticket_folder}/` or program subfolder. Never stage or commit anything under `.idea/`.
- Keep one current set of requirements. Link requirements and owner decisions shared across tickets instead of rewriting them in each ticket. Here, a **contract** means agreed behavior or an interface that other code relies on.
- If referenced ticket documents are missing in a fresh checkout, request them or establish new ones with the owner. Do not invent prior approvals or decisions. Direct work follows the exception above.
- In planned work, `research.md` is the first ticket document a fresh worker reads. It supplies checked facts and links to relevant code, not a replacement for approved requirements. Step 0 delegates to the existing global `research` agent without overriding its model.
- A worker's final message is normally its handoff to the coordinator. Keep decisions, results, and remaining work in the existing ticket documents; do not copy every return into a new file. See [Step 4](step4_implementation.md#assignment-and-handoff-format) for the limited cases that need a separate file.
- Use one ticket branch, preferably in its own worktree, and record the ticket-document folder at intake. Workers share that workspace; they do not create new branches or separate copies of ignored plans.

## Step guide

| Step                    | Read when authorized                   | Local deliverable                 |
| ----------------------- | -------------------------------------- | --------------------------------- |
| 0 — Intake and research | [Step 0](step0_research.md)            | `research.md`                     |
| 1 — Feature description | [Step 1](step1_feature_description.md) | `step1_feature_description.md`    |
| 2 — Solution assessment | [Step 2](step2_solution_assessment.md) | `step2_solution_assessment.md`    |
| 3 — Development plan    | [Step 3](step3_development_plan.md)    | `step3_development_plan.md`       |
| 4 — Implementation      | [Step 4](step4_implementation.md)      | `step4_implementation_summary.md` |

Historical tickets may use a different filename order. Identify their approved content explicitly; do not copy the old order into new tickets or silently rename historical artifacts.

## Approval protocol

1. Start at Step 0, or validate existing reviewed research when resuming a ticket. Its independent evidence review adds no owner approval phrase. Record which feature, step, and revision any existing approval covers; research is not design approval.
2. For Steps 1–3, deliver the current step and request `Approved Step N`. Pause; do not draft the next step before that approval. Step 0 proceeds to Step 1 after its evidence review; Step 4 concludes with the verification and Git handoff below.
3. Resolve blocking owner decisions before requesting approval. Answering an individual question is not approval of the whole step, and a recommendation is not an owner ruling.
4. Batch planning without per-step pauses requires explicit owner authorization for that batch. Record the scope of that exception; old batch instructions are not continuing permission. Unanswered blocking decisions still block dependent planning.
5. `Approved Step 3` permits implementation unless an explicit planning-only or implementation hold is active. Such a hold requires a separate instruction to resume implementation; plan approval alone does not lift it.
6. Step approval never grants permission to stage, commit, merge, push, or open a PR. Branch/worktree setup also requires authorization; record proposed setup when permission is absent. Request Git actions separately unless the owner already authorized those actions for the current work.

## Working rules

- Unless the owner skips planning, complete Steps 1 and 2 even when only one approach is workable.
- Check facts before asking the owner to choose. Ask about outcomes, scope, or choices with meaningful costs, and give enough context to answer without a follow-up explanation.
- Reuse existing shared components and API definitions. Check that they exist and are used in the relevant code path.
- Keep documents concise, but do not sacrifice decision context to a one-page limit. Link detailed evidence rather than repeating it.
- Group related work into stages and state what remains incomplete after each one. Once the feature works as a whole, test the agreed behavior, realistic failure cases, and related behavior that could break. Follow [CONTRIBUTING.md](../../CONTRIBUTING.md#when-tests-find-a-problem) when tests reveal a problem; not every new finding is a requirement to expand the feature. Do not run full suites against intentionally unfinished work or call partial progress complete.
- If the feature exceeds roughly a day or eight stages, propose a split before implementation. Do not compress code to satisfy a line-count target.
- Make schema changes when the approved behavior needs them; do not add extra compatibility code merely to avoid a necessary change.
- If new evidence means changing the approved behavior or design, pause the affected work and ask for approval of that change.
- Update requirements, examples, and success criteria when the owner makes a decision. Mark replaced decisions as no longer current; do not leave conflicting instructions active.

## Completion and commits

After each implementation stage, update the existing summary with changes, checks run, and checks that must wait for later stages. Continue through the approved plan; do not create per-stage commits or proposed commit messages.

Keep implementation changes unstaged and uncommitted until the owner requests Git actions; preserve anything already staged. Review the entire ticket diff, including new untracked files. When committing is authorized, make one final ticket commit; do not create intermediate commits just to squash them. Merge into `main` only with separate authorization. Keep each completed and verified F feature separate in multi-feature programs. The owner's later manual uncommit/review workflow is not permission for the agent to reset history. Local planning documents remain excluded even when approved.
