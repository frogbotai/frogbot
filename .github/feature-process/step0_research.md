# Step 0: Intake and research

Ground the ticket before [Step 1](step1_feature_description.md) becomes approval-ready. Follow the [canonical overview](FEATURE_DEVELOPMENT_PROCESS.md) for approval gates. Step 0 establishes facts, evidence, and navigation; it adds no owner approval phrase and does not approve a design.

## Intake and scope

1. Read the request and relevant sections of `.idea/issue_triage.md`, existing tickets, program contracts, and owner rulings. Inspect overlaps, dependencies, priority calibration, and prior scope decisions; reading the entire historical ledger is not mandatory.
2. Reuse the existing ticket and artifact folder when the scope matches. For new tickets, continue above the highest existing local `.idea/tickets/ticketNN_*` number, checking recorded reservations too. GitHub issue IDs are a separate mapping, never the ticket-number source.
3. Record the exact ask, affected users/surfaces, repository ownership, priority/type, dependencies, and exclusions already authorized. Verify root-cause claims against source before publishing triage conclusions; issue text alone is not evidence.
4. For a batch, append a dated `Issue Triage — Batch N` section with issue-to-ticket mapping, overlap notes, and a **Suggested Order** table: order, ticket, issues, priority, type. Explain dependencies and shared-file sequencing. Preserve previous entries and tables.
5. Research may recommend rejecting or narrowing scope, but cannot settle that decision. Surface “research recommends rejecting X” in the batch summary and obtain an owner ruling before dependent step planning. Historical deferrals are not current authorization: check whether prerequisites have shipped. Do not add acceptance criteria, close an issue as deferred, or split away blocked external surfaces without owner agreement. Filing or closing issues and posting or editing public issue/PR comments require explicit authorization, not merely research or step approval. New issues may describe authorized future work; closure must reflect completed scope or an explicit owner disposition without falsely claiming implementation.

## Workspace and authority

- Select one ticket branch, preferably in its own worktree. Record the current repository root, branch, base revision, relevant existing changes, and existing artifact/contract paths before setup. Reuse an appropriate existing workspace; do not create a branch per subagent.
- Create or switch branches/worktrees only when authorized. Planning-only work must not mutate source or Git state; read-only assignments must not write artifacts either. Record proposed setup when permission is absent. Planning artifact edits require their own allowed scope, and plan approval never lifts an implementation hold.
- Keep one canonical local artifact folder. Ignored `.idea/` artifacts are not shared across worktrees: pass its **absolute path** to every worker, separately from the code worktree path. Record missing access/context as a blocker; do not fabricate approvals or silently create divergent copies.
- Keep `.idea/` artifacts out of staging and commits. Implementation and handoffs follow [Step 4](step4_implementation.md). Use one ticket-level final commit only when authorized, with no per-stage commits or proposed messages. Merge into `main` only when explicitly authorized; manual uncommit operations remain with the owner.

## Delegate evidence gathering

Use the existing global `research` agent at `~/.config/opencode/agent/research.md`. Read its current instructions and retain its configured cheaper model unchanged; do not recreate the agent, edit global configuration, or override its model in dispatch. Availability is harness-specific. If the agent is unavailable, report that and request an authorized equivalent; never silently substitute a more expensive worker.

Give each assignment one `research.md` output using the [required outline](#research-document-outline) below. Parallelize independent tickets only with separate artifact ownership. Include:

- The exact question/scope, issue and relevant ledger links, current contract/rulings, and active holds.
- Absolute code workspace and canonical artifact folder, source revision/known changes, allowed edits, and the single output path.
- Applicable repositories and questions they answer; concrete implementation, types, tests, fixtures, and runtime entry points to inspect.
- Actual findings/reproduction inputs, existing proof tests if any, and required assumption audit, verification map, and return blockers.

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

Read relevant implementation **and types and tests**, not just search hits or summaries. For each consulted repository, record its absolute root, revision/package version, relevant dirty state, and full repository-relative `path:line` ranges actually read. Use `repo/path:line` citations tied to that baseline; refresh stale references. Record routing rationale compactly, including relevant unavailable sources and why other candidate sources do not apply.

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

- Separate the user-visible contract from its owning invariant and source of truth. Trace the full relevant production path from entry point through enforcement to consumers: applicable cold/warm, HTTP/local, built-in/custom, generated/fallback, omitted/empty, and failure paths.
- Prove actual production wiring. Name relevant call sites and their count, or identify missing wiring; a parameter, guard, or hook used only in tests is not enforcement. Restoring wiring is a behavior change that needs planned verification.
- Mark each assumption **VERIFIED**, **DISPROVEN**, or **INFERRED**, with evidence and consequence. A load-bearing unresolved inference makes status `UNVERIFIED` and blocks dependent planning. A disproven central premise is `REJECTION-CANDIDATE`; `FIX-NOT-RECOMMENDED` is advice, not owner-approved rejection.
- Explain rejected symptom-level patches and the paths they leave broken. Restore the owning invariant rather than duplicate registries, lists, or consumer checks. Recommendations cannot silently reduce the central ask.
- For bugs, include current behavior, reproducible steps, and a **Why tests missed it** audit citing the nearest specs and hidden/mock boundaries. Identify tests that codify broken behavior and plan their correction. Feed suite-level lessons into `.idea/test_hardening_todo.md` through the coordinator when edits there are authorized.
- The coordinator or an independent `explore` reviewer critically checks every load-bearing claim against source, actual wiring, exact intake scope, and current contracts. Record reviewer, baseline, findings, resolution, and verdict. Worker self-review alone cannot make Step 1 approval-ready.

A preliminary Step 1 intake brief is allowed if clearly marked **unresearched — not approval-ready**. No substantive later planning proceeds while research or owner blockers remain. Step 0 factual review adds no `Approved Step 0` gate; recommendations and material scope choices still use Step 1's owner-decision format and existing approval protocol.

## Verification planning and handoff

Map acceptance criteria and adversarial cases to the owning boundary and relevant production integration/E2E paths. Read current package scripts, test-runner configuration, collected tests, fixtures, and CI wiring to identify actual commands, working directories, setup, and environment requirements; do not copy stale README commands or assume a harness is missing. Label tests **planned**, and distinguish checks actually run with results from not-run/blocked checks.

Plan a dedicated ticket-level testing stage after coherent implementation: applicable unit, integration, and relevant E2E acceptance plus adversarial coverage. Transitional stages need focused checks, not repeated full suites or an automatic regression-tests-first stage. Bug proof should expose the real pre-fix mechanism without mocking the failing boundary. Docs-only work checks formatting, links, and content. Follow [contribution verification policy](../../CONTRIBUTING.md#verification) and [Step 4](step4_implementation.md) for execution and reporting.

Make `research.md` the fresh worker's **first ticket-artifact read**: concise orientation, evidence/navigation, current holds, blockers, and links to approved contracts and the authorized step. It is not a replacement design document. Recommended direction stays explicitly unapproved until the corresponding owner decision/step approval is recorded.

Update research when source, versions, evidence, wiring, or rulings change; add a dated revision note and identify affected conclusions. Correct the artifact itself rather than leaving discoveries only in chat or later steps. Reopen affected research/approval gates if a change invalidates the direction. Give the next worker a focused read order and changed-evidence list so they verify their boundary without rescanning every repository.
