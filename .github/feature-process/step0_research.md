# Step 0: Intake and research

Check the facts before asking the owner to approve [Step 1](step1_feature_description.md). Follow the [overview](FEATURE_DEVELOPMENT_PROCESS.md) for approvals. Step 0 records what we know and where to find the relevant code; it needs no separate owner approval and does not approve a design.

## Intake and scope

1. Read the request and relevant sections of `.idea/issue_triage.md`, existing tickets, shared requirements, and owner decisions. Check for overlapping work, dependencies, priorities, and earlier scope decisions; do not read the entire history unless needed.
2. Reuse the existing ticket and artifact folder when the scope matches. For new tickets, continue above the highest existing local `.idea/tickets/ticketNN_*` number, checking recorded reservations too. GitHub issue IDs are a separate mapping, never the ticket-number source.
3. Record the exact request, affected users and features, repositories involved, priority/type, dependencies, and agreed exclusions. Check claimed causes against source code before publishing conclusions; an issue description alone is not proof.
4. For a batch, append a dated `Issue Triage — Batch N` section with issue-to-ticket mapping, overlap notes, and a **Suggested Order** table: order, ticket, issues, priority, type. Explain dependencies and shared-file sequencing. Preserve previous entries and tables.
5. Research may recommend rejecting or narrowing scope, but cannot settle that decision. Surface “research recommends rejecting X” in the batch summary and obtain an owner ruling before dependent step planning. Historical deferrals are not current authorization: check whether prerequisites have shipped. Do not add acceptance criteria, close an issue as deferred, or split away blocked external surfaces without owner agreement. Filing or closing issues and posting or editing public issue/PR comments require explicit authorization, not merely research or step approval. New issues may describe authorized future work; closure must reflect completed scope or an explicit owner disposition without falsely claiming implementation.

## Workspace and authority

- Select one ticket branch, preferably in its own worktree. Record the current repository root, branch, base revision, relevant existing changes, and existing artifact/contract paths before setup. Reuse an appropriate existing workspace; do not create a branch per subagent.
- Create or switch branches/worktrees only when authorized. Planning-only work must not mutate source or Git state; read-only assignments must not write artifacts either. Record proposed setup when permission is absent. Planning artifact edits require their own allowed scope, and plan approval never lifts an implementation hold.
- Keep ticket documents in one local folder. Ignored `.idea/` files are not shared across worktrees: pass the folder's **absolute path** to every worker, separately from the code worktree path. Report missing access or required context; do not invent approvals or create separate copies.
- Keep `.idea/` artifacts out of staging and commits. Implementation and handoffs follow [Step 4](step4_implementation.md). Use one ticket-level final commit only when authorized, with no per-stage commits or proposed messages. Merge into `main` only when explicitly authorized; manual uncommit operations remain with the owner.

## Delegate evidence gathering

Use the existing global `research` agent at `~/.config/opencode/agent/research.md`. Read its current instructions and keep its configured model; do not recreate the agent, edit global configuration, or override its model in the assignment. Available agents depend on the tool running the session. If this agent is unavailable, report that and ask which replacement to use; do not silently substitute a more expensive worker.

Give each ticket one `research.md` using the [outline](#research-document-outline) below. Update that document for follow-up research rather than adding a report for each worker. Only run research on independent tickets in parallel when their documents are separate. Include:

- The exact question/scope, issue and relevant ledger links, current contract/rulings, and active holds.
- Absolute code workspace and ticket-document folder, source revision/known changes, allowed edits, and the single output path.
- Applicable repositories and questions they answer; concrete implementation, types, tests, fixtures, and runtime entry points to inspect.
- Known findings, steps or inputs that reproduce the problem, and existing tests if any. Ask the worker to check assumptions, identify useful tests, and report anything that prevents a conclusion.

Name the ticket's actual domain, entry points, and test harness. Existing proof tests are inputs when present, not a prerequisite or evidence that a tagged `it.fails` test exists. The global agent provides research discipline; this step defines FrogBot's workflow and research output. If the installed agent's instructions conflict, report the conflict rather than silently overriding them or mechanically searching irrelevant repositories.

## Research document outline

Use these sections in each ticket's `research.md`. Keep them short, link existing contracts, and omit details that do not apply. Follow the evidence and review rules below rather than copying them into the document.

1. **Request and context:** scope, workspace and artifact paths, current approvals, holds, and a short summary for the next worker.
2. **Current behavior:** relevant code paths, the boundary that owns the behavior, and reproduction evidence for bugs.
3. **Reference findings:** what relevant local repositories do, source citations, versions/revisions, and important differences.
4. **Facts and open questions:** verified, disproven, and inferred claims; missing evidence and owner decisions.
5. **Recommended direction:** proposed changes, alternatives, and risks. A recommendation is not approval.
6. **Testing:** current coverage and gaps, why tests missed a bug, proposed acceptance and failure cases, test paths and commands. New test code belongs under root `test/`; distinguish planned checks from checks actually run.
7. **Review and handoff:** research status, independent review findings, revisions, blockers, and a focused reading order for the next worker.

## Local-source routing

Read relevant implementation **and types and tests**, not just search hits or summaries. For each repository used, record its absolute root, revision/package version, relevant uncommitted changes, and repository-relative `path:line` ranges actually read. Keep citations tied to the version checked and update stale references. Briefly explain which sources apply and which relevant sources are unavailable; do not investigate unrelated repositories to fill a checklist.

Reference roots below are normally under `~/code/`; confirm and record the actual paths available in the current environment.

| Question                                                    | Evidence route                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current FrogBot behavior                                    | Working repository's public contract, implementation, types, production callers, tests, and configured fixtures.                                                                                                                                                                                                 |
| AI SDK options, provider namespaces, types, wire emission   | Resolve installed `ai` / `@ai-sdk/*` versions and lockfile first; inspect installed source, then `~/code/ai`. Record checkout version/revision skew explicitly; newer checkout behavior is not proof of installed behavior. If installed source is unavailable, record the gap.                                  |
| Core collection/field/access/lifecycle semantics            | `~/code/payload` for internals, types, tests; `~/code/payload-ai` for relevant integration patterns.                                                                                                                                                                                                             |
| Admin/UI                                                    | Corresponding `~/code/firmware` implementation is the UI spec: inspect applicable `apps/web`, `apps/desktop`, `packages/app`, `packages/ui`, or admin customizations. Cite it, plan faithful reuse/porting, and list deviations for owner resolution. Report a missing counterpart rather than inventing parity. |
| Gateway architecture, translation, schema, hooks, streaming | Both `~/code/hebo-gateway` and `~/code/portkey-gateway-embed`; read analogous modules, tests, and failure handling. Compare applicable behavior and meaningful disagreements.                                                                                                                                    |
| Production client requests, SSE, retries, errors            | `~/code/hermes-agent` and shipped `~/code/opencode`.                                                                                                                                                                                                                                                             |
| Agent/tool/config runtime                                   | `~/code/opencode` is current shipped behavior. Use `~/code/opencode-v2` only for future 2.0 architecture/direction, explicitly labeled future/beta.                                                                                                                                                              |
| Comparative CMS/platform architecture                       | `~/code/strapi` and `~/code/directus` when relevant; comparative ideas, never authority for FrogBot behavior.                                                                                                                                                                                                    |
| Upstream wire contracts or material unavailable locally     | Fetch primary official specs/docs and cite exact URLs with retrieval date/version. Upstream wire claims require official specifications; local implementations corroborate them. Use web sources for unavailable local material, not instead of available local code/examples/docs.                              |

Absence claims require successful multi-term searches, plausible filename searches, and reading the analogous module. A failed search command is not evidence of absence. When recommending a convention, distinguish required behavior from reference preferences; one implementation does not establish an industry standard.

## Evidence quality and review

- Identify what users expect and where the code ensures that behavior. Trace the relevant path from request to result. Check variations that matter to the feature, such as first startup versus reuse, HTTP versus local calls, default versus custom behavior, generated versus fallback types, missing versus empty inputs, and failures.
- Check that the application actually calls the code being discussed. Name the relevant callers and their count, or identify missing connections; a check used only in tests does not protect real users. Plan tests for any restored connection.
- Mark assumptions **VERIFIED** (checked), **DISPROVEN** (contradicted by evidence), or **INFERRED** (plausible but not checked), with evidence and consequences. If the proposed solution depends on an unchecked assumption, mark research `UNVERIFIED` and pause dependent planning. If the evidence suggests rejecting the request, explain why and ask the owner; research alone cannot reject it.
- If a proposed fix only hides a symptom, explain which problem remains. Prefer fixing the code responsible for the behavior rather than adding the same check in several places. Recommendations cannot silently reduce the request or expand the solution; follow the [test-finding rules](../../CONTRIBUTING.md#when-tests-find-a-problem).
- For bugs, include current behavior, reproducible steps, and **Why tests missed it**, citing the nearest tests and anything they mock or do not exercise. Identify tests that expect broken behavior and plan their correction. Record broader testing lessons in `.idea/test_hardening_todo.md` through the coordinator only when edits there are authorized.
- The coordinator or an independent `explore` reviewer checks the claims the proposal depends on against source, actual application calls, the request, and current requirements. Record who reviewed which version, findings, corrections, and whether the evidence is sufficient. Worker self-review alone is not enough to request Step 1 approval.

A preliminary Step 1 intake brief is allowed if clearly marked **unresearched — not approval-ready**. No substantive later planning proceeds while research or owner blockers remain. Step 0 factual review adds no `Approved Step 0` gate; recommendations and material scope choices still use Step 1's owner-decision format and existing approval protocol.

## Verification planning and handoff

For each agreed requirement and realistic failure case, identify which code is responsible and how to test it through the application. Read current package scripts, test-runner configuration, tests, fixtures, and CI setup to find commands, working directories, and environment requirements; do not copy stale README commands or assume test support is missing. Label proposed tests **planned**, and separate their expected results from checks actually run.

Plan a testing stage once the feature's parts work together: check the agreed behavior, realistic failure cases, and related behavior that could break. Earlier stages need focused checks, not repeated full suites or an automatic tests-first stage. Bug tests should reproduce the actual failure without replacing the failing component with a mock. Markdown-only work checks formatting, links, examples, and content. Follow [CONTRIBUTING.md](../../CONTRIBUTING.md#verification) and [Step 4](step4_implementation.md) for execution and reporting.

Make `research.md` the fresh worker's **first ticket-document read**: a short introduction, evidence, relevant code links, current holds, blockers, and links to approved requirements and the current step. It does not replace those requirements. Recommendations stay unapproved until the owner makes the relevant decision or approves the step.

Update research when changed code, versions, or owner decisions affect its conclusions; add a dated note explaining what changed. Correct the document rather than leaving conflicting advice in chat or later steps. If a change invalidates the approved approach, ask for revised approval. Tell the next worker which evidence changed and what to read, so they can check their part without rescanning every repository.
