# Feature development process

Feature work starts with intake and delegated research, then four steps: agree on the outcome, agree on the approach, approve the plan, and implement and verify it. Read this overview and the current step only; load later execution instructions when authorized. Do not reprint these instructions.

## When to use this process

- Use this process for planned feature and ticket work. Small, direct edits do not need a ticket or planning documents.
- If the owner says “just do the work now,” “skip planning,” or gives another clear instruction to proceed, implement the named scope without waiting for planning approvals. The owner may also skip specific steps. Do not create missing research or plan files merely to unlock implementation, and do not claim skipped steps were approved.
- Still inspect the relevant code, follow contributor conventions, and verify the change. Ask only about missing details that would materially change the result, not whether the owner really meant to skip the process.
- A clear instruction to resume implementation of the same work lifts its earlier planning-only hold. A plan approval or unrelated request does not. If the scope is unclear, clarify it.
- These exceptions apply to every step below. They do not grant permission to stage, commit, merge, push, open a PR, or change branch/worktree setup. Existing Git permissions remain unchanged.

## Instructions and artifacts

- This directory contains the canonical shared process instructions. [CONTRIBUTING.md](../../CONTRIBUTING.md) owns coding, architecture, verification, and contribution conventions; `CLAUDE.md` routes agents to the relevant instructions.
- Deliverables stay in a dedicated local `.idea/{feature_name}/` folder, or an existing `.idea/tickets/{ticket_folder}/` or program subfolder. Never stage or commit anything under `.idea/`.
- Keep one current requirements source. Link existing program contracts and owner rulings instead of redesigning them in each ticket.
- If referenced local artifacts are missing in a fresh checkout, request them or establish new ones with the owner. Do not invent prior approvals or decisions.
- `research.md` is the first ticket artifact every fresh worker reads. It supplies verified evidence and focused navigation, not a replacement for approved requirements. Step 0 delegates to the existing global `research` agent without overriding its model.
- Use one ticket branch, preferably in its own worktree, with a canonical artifact folder recorded at intake. Fresh subagent sessions share that workspace; they do not create new branches or divergent copies of ignored plans.

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

- Steps 1 and 2 are mandatory alignment gates, even when only one implementation direction is viable.
- Research factual uncertainties before asking the owner to choose. Owner questions concern outcomes, scope, or material trade-offs, with enough context to answer in one pass.
- Reuse canonical components and API contracts. Verify that they exist and are wired into the relevant path.
- Keep documents concise, but do not sacrifice decision context to a one-page limit. Link detailed evidence rather than repeating it.
- Use cohesive stages with explicit intermediate states. Every ticket includes a dedicated verification stage once its behavior is coherent: acceptance, adversarial cases, and regression checks. Do not run broad suites through deliberately incomplete wiring or treat intermediate progress as ticket acceptance.
- If the feature exceeds roughly a day or eight stages, propose a split before implementation. Do not compress code to satisfy a line-count target.
- Assess schema changes against the approved contract; do not introduce compatibility scaffolding merely to avoid a necessary change.
- If new evidence changes approved behavior or architecture, stop affected work and return to the relevant approval gate.
- Reconcile accepted rulings into current requirements, examples, and success criteria. Clearly mark historical decisions as superseded; do not leave conflicting instructions active.

## Completion and commits

After each implementation stage, record changes, meaningful checks, and any validation deferred to the ticket-level testing stage. Continue through the approved plan; do not create per-stage commits or proposed commit messages.

Keep implementation changes unstaged and uncommitted until Git actions are requested, preserving any pre-existing index state. Hand off the entire ticket diff, including new untracked files. When explicitly authorized, finish with one squashed ticket commit and merge into `main`; do not create artificial intermediate commits just to squash them. Keep each completed and verified F feature separate in multi-feature programs. The owner's later manual uncommit/review workflow is not permission for the agent to reset history. Local planning artifacts remain excluded even when approved.
