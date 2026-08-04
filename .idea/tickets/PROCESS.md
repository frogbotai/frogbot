# Ticket Process

How each triaged ticket (see `../issue_triage.md`) moves from triage to merged fix.

## Required reading (by reference)

A ticket folder plus these documents is the complete context an agent needs — do not
rely on chat history:

- `.idea/feature_process/FEATURE_DEVELOPMENT_PROCESS.md` — the four-step feature
  process the step docs follow (overview + approval protocol).
- `.idea/feature_process/step1_solution_assessment.md` — how to write `step1_solution_assessment.md`.
- `.idea/feature_process/step2_feature_description.md` — how to write `step2_feature_description.md`.
- `.idea/feature_process/step3_development_plan.md` — how to write `step3_development_plan.md`.
- `.idea/feature_process/step4_implementation.md` — how to execute stages and propose commits.
- `.idea/tickets/_TEMPLATE.md` — the mandatory `research.md` structure.
- `.idea/issue_triage.md` — ticket ↔ issue mapping and triage history.

## Per-ticket artifacts

Each ticket gets a folder `.idea/tickets/<ticket_folder>/` containing:

| File | Author | Purpose |
|------|--------|---------|
| `research.md` | research subagent | Single doc with everything an implementing agent needs: root cause with `path:line` citations, assumption audit, reference behavior (AI SDK / Payload / Next), fix direction, regression-test spec. Follows `_TEMPLATE.md`. |
| `step1_solution_assessment.md` | main agent | Options + recommendation (feature process Step 1). |
| `step2_feature_description.md` | main agent | Problem, stories, requirements, success criteria (Step 2). |
| `step3_development_plan.md` | main agent | Atomic stages (Step 3). **Stage 1 is always: write regression tests that reproduce the issue and would have caught it before release.** These tests are the executable proof of the bug and the acceptance criteria for the fix. |

Steps 1–3 for this triage batch are produced autonomously (no per-step approval
gate); the user reviews the finished set.

## Workflow

**Steps 1–3 are a docs-only phase.** A triage/research round produces `research.md` plus
the three step docs and touches nothing under `packages/`. Step 4 begins only when the
owner says so, per ticket — never rolled into the same pass as research because a ticket
"looks small". Prepared docs must be complete enough that an implementation agent needs
no further context.

1. **Branch** — one branch per ticket, created when implementation (Step 4)
   begins, from the integration branch. Names are recorded in each ticket's
   step3 doc. Branch creation/commits are run by the user (or with explicit
   permission per session).
2. **Research** — research subagent writes `research.md`. It must trace the complete
   behavior from public contract to owning lifecycle/source of truth, not stop at the
   crashing handler or first failing check. A doc concluding `UNVERIFIED` or
   `REJECTION-CANDIDATE` blocks implementation until resolved.
3. **Research review gate** — the main agent independently checks every load-bearing
   claim against source, reconciles the research with the exact issue/triage wording,
   and rejects adapter-, route-, or handler-level fixes when a core invariant can be
   restored. Contradictions between research and step docs block implementation.
4. **Steps 1–3** — written only after the review gate passes.
5. **Step 4** — implementing agent works the step3 stages in order on the
   ticket branch. Stage 1 (regression tests) must fail before the fix and pass
   after. Follow `.idea/feature_process/step4_implementation.md`: propose a
   commit per stage, never self-commit.
6. **Close** — PR references only issue scope actually completed; partially blocked
   multi-surface issues are re-filed or referenced without falsely closing them.

## Research quality gate

Every ticket must answer these before it is marked researched:

1. **Public contract:** What must users be able to rely on? Separate public FrogBot
   types/behavior from internal Payload, Next, gateway, or adapter mechanisms.
2. **Owning invariant:** Which core boundary should guarantee that contract? Prefer
   lifecycle/config/type-generation fixes over repeated checks at consumers.
3. **Source of truth:** Which registry, generated artifact, config, or upstream API owns
   the data? Do not introduce a second provider/model/env-var/path list.
4. **Complete path audit:** Trace every entry path and consumer, including cold/warm,
   local/HTTP, generated/fallback, built-in/custom, and omitted/empty cases that apply.
5. **Assumption proof:** Every load-bearing claim is `VERIFIED` against read source or
   current primary documentation. `INFERRED` claims cannot determine the fix.
6. **Rejected band-aids:** Explicitly list handler/route/adapter patches considered and
   why they do not restore the invariant globally.
7. **Scope discipline:** Do not invent acceptance criteria (new endpoints, response
   shapes, UI fixes) that the issue did not request. Split blocked external surfaces.
8. **Executable proof:** Tests target the owning boundary plus one end-to-end path; they
   must fail for the real pre-fix mechanism, not merely assert implementation details.
9. **Test-gap audit:** For every bug, explain why the existing suite missed it
   (`Why Tests Missed It` in `research.md`), citing the nearest existing spec and the
   mocked/partial boundary that hid the defect. Suite-level lessons feed
   `.idea/test_hardening_todo.md`.
10. **Wired, not merely present:** Before citing a mechanism as existing enforcement,
    verify it has real production call sites. A parameter, hook, guard, or field that
    only unit tests pass is dead code, and "just wiring it up" is itself a
    behavior change that needs its own stage and its own tests. State explicitly
    whether each cited mechanism is wired, and to how many call sites.
    (Batch 4, ticket 30: `resolveProvider`'s `models` param was live in the signature
    and dead in production — ~16 unwired call sites — which the issue text hid.)
11. **Tests that codify the bug:** Search the existing suite for tests that assert the
    BROKEN behavior as expected. Fixing the code without correcting those tests
    produces a red suite and invites "fixing" the fix. Any such test must be named in
    `research.md` and get a dedicated stage in step3.
    (Batch 4, ticket 28: `agents/endpoints.spec.ts:357-368` asserted the security hole
    as intended behavior.)
12. **Deferral is not a research conclusion:** Research may report that something is
    unimplemented, deliberately or not, but it may NOT conclude the ticket by closing
    the issue as deferred/won't-do, and step docs may not contain a "deferral record"
    stage unless the owner said so in this session. Prior triage notes recording a
    deferral are history, not authorization — they were often written when a blocking
    prerequisite was open. Re-check whether the blocker has since shipped and say so.
    (Batch 4: #26 was written up as a "confirmed, deliberate scope cut" and planned as a
    deferral record; the owner in fact wanted it built, and its stated prerequisite —
    ticket 17's marker work — had already shipped in `ae16964`.)
13. **UI tickets — Firmware is the spec:** For any admin/UI surface, `research.md` must
    contain the corresponding Firmware implementation with `path:line` from
    `~/Documents/Code/firmware`, and the fix direction must be a faithful port. Every
    deviation is listed individually with a justification; "designed something
    equivalent" is a rejected outcome. See CLAUDE.md → "UI Parity with Firmware".

## Review gate feedback loop

Steps 1–3 are written from `research.md`, but the step-writing pass routinely finds
errors in it (wrong path, stale line numbers, an open question that the code already
answers, a claimed-missing test harness that exists). When that happens:

- Correct `research.md` itself and add/extend its **Revision** note — do not leave the
  correction only in a step doc, or the next reader inherits the wrong version.
- Corrections are appended to the revision note with a date and reason; never edit the
  status token to carry prose.
- If a correction invalidates the fix direction (not just a citation), the ticket returns
  to research before step docs are finalized.

## Implementation orchestration (Step 4 batch mode)

With explicit per-session permission, a coordinating agent runs tickets
sequentially, one implementation subagent per ticket:

1. **Cut branch** — subagent creates the ticket branch from current `main`
   (each ticket branches after the previous merge, so dependent fixes —
   e.g. ticket 3 on ticket 2, tickets 1/4 sharing `agents/endpoints` —
   land on top of each other cleanly).
2. **Work the stages** — subagent reads `research.md` + steps 1–3, implements
   each step3 stage in order, and makes **one commit per stage**
   (Conventional Commits, e.g. `test(frogbot): add cold REST regression tests`).
   Stage 1 tests land `it.fails`-tagged so the branch stays green; later
   stages flip them.
3. **Verify** — before implementation, run the full non-live suite and e2e on
   the integration branch. Rebuild workspace packages consumed from `dist` before e2e
   so tests cannot exercise stale artifacts. Before merging, require `pnpm test`,
   `pnpm test:e2e`, typecheck, and lint for changed files to pass. Live tests
   that require external credentials or paid services may be skipped and must
   be reported. Repo-wide lint failures are acceptable only when confirmed as
   pre-existing and unrelated to the branch.
4. **Squash-merge** — coordinator squash-merges the branch into `main` with a
   single concise message, ≤ 60 chars, Conventional Commits format
   (e.g. `fix(next): bootstrap frogbot on cold REST requests`),
   referencing the issue in the body (`Fixes #N`) when applicable.
5. **Repeat** — next ticket branches from the updated `main`.

Order for the original batch: ticket 1 → 2 → 3 → 4 → 5 → 6 → 7
(1 and 2 are P0; 3 depends on 2; 1 and 4 both touch `agents/endpoints`;
ticket 7 is scoped to the `docs.json` GitHub link only — the visual site
fixes are blocked, the landing-page source lives outside this repo).

## Tickets

| Folder | Issues | Branch |
|--------|--------|--------|
| `ticket1_cold_rest_crash` | #9 | `fix/cold-rest-crash` |
| `ticket2_cli_env_loading` | #8 | `fix/cli-env-loading` |
| `ticket3_provider_apikey_typing` | #5 | `fix/provider-apikey-typing` |
| `ticket4_agents_empty_validation` | #6 | `fix/agents-empty-validation` |
| `ticket5_model_intellisense` | #7 | `feat/model-intellisense` |
| `ticket6_cfa_scaffold` | #3, #4 | `chore/cfa-scaffold` |
| `ticket7_site_ui_polish` | #2 docs portion; #1/external blocked | `docs/github-link` |
| `ticket8_prettier_examples` | #10 | `chore/prettier-examples` |
| `ticket9_codegen_model_validation` | #11 | `fix/codegen-model-validation` |
| `ticket10_next_client_exports` | #12 | `fix/next-client-exports` |
| `ticket11_model_catalog_sync` | #13 | `feat/model-catalog-sync` |
| `ticket12_empty_agent_tools` | #14 | `fix/empty-agent-tools` |
| `ticket13_userless_thread_persistence` | #15, #16 | `feat/userless-thread-persistence` |
| `ticket14_chat_request_body` | #17, #18 | `fix/chat-request-body` |
| `ticket15_email_warning_lifecycle` | #19 | `fix/email-warning-lifecycle` |
| `ticket16_gateway_usage_tracking` | none (internal) | `feat/gateway-usage-tracking` |
| `ticket17_usage_logs_role_marker` | #20 | `feat/usage-logs-role-marker` |
| `ticket18_init_failure_recovery` | #21, #29 | `fix/init-failure-recovery` |
| `ticket19_cfa_release_age` | #22 | `fix/cfa-minimum-release-age` |
| `ticket20_agent_schedule_triggers` | #23 | `feat/agent-schedule-triggers` |
| `ticket21_json_agent_double_persist` | #24 | `fix/json-agent-double-persist` |
| `ticket22_docs_syntax_highlighting` | #25 | `docs/code-syntax-highlighting` |
| `ticket23_api_keys_plugin` | #26, #27 | `fix/api-keys-plugin` (#27, merged `b18303c`); `feat/usage-log-key-attribution` (#26) |
| `ticket24_bedrock_credential_chain` | #28 | `fix/bedrock-credential-chain` |
| `ticket25_token_prefix` | #30 | `feat/frogbot-token-prefix` |
| `ticket26_e2e_tool_calling` | #31 | `test/e2e-agent-tool-calling` |
| `ticket27_ui_port` | none yet (owner-directed) | `feat/firmware-ui-port` |
| `ticket28_thread_access_bypass` | #32 | `fix/thread-access-bypass` |
| `ticket29_logger_type` | #33 | `fix/logger-type` |
| `ticket30_model_allowlist` | #34 | `feat/provider-model-allowlist` |
| `ticket31_api_keys_modal_ui` | #35 | `fix/api-keys-modal-ui` |
| `ticket32_mcp_tools` | #36 | `docs/mcp-tools-answer` |
| `ticket34_agent_profile` | #38 | `feat/agent-profile` |
| `ticket35_agent_skills` | #39 | `feat/agent-skills` |
| `ticket36_root_tools` | #40 | `feat/root-tools` |
| `ticket37_thread_todos` | #41 | `feat/thread-todos` |
| `ticket38_web_search` | #42 | `feat/web-search` (blesses Brave + Exa; gated on ticket 39) |
| `ticket39_secret_text_credential_shape` | none yet (owner to file) | `fix/secret-text-credential-shape` |
| `ticket40_firmware_ui_foundation` | none (owner-directed, Ticket 27 slice) | `feat/firmware-ui-foundation` |
| `ticket41_shiki_code_block` | none (owner-directed, Ticket 27 Q3 decision) | `feat/shiki-code-block` |
| `ticket42_sdk_ai_surface` | none (owner-directed, Ticket 27 Q4 decision) | `feat/sdk-ai-surface` |
| `ticket43_voice_input` | none (owner-directed, Ticket 27 Q4 decision; depends on ticket 42) | `feat/voice-input` |
| `ticket44_icons_port` | none (owner-directed, Ticket 27 Q5 rulings) | `feat/firmware-icons` |
| `ticket45_composer_selectors` | none (owner-directed, Ticket 27 Q5 rulings) | `feat/composer-selectors` |
| `ticket46_page_context_flags` | none (owner-directed, Ticket 27 Q5 rulings) | `feat/page-context-flags` |
| `ticket47_markdown_parity` | none (owner-directed, Ticket 27 Q5 rulings; lands before ticket 41) | `feat/markdown-parity` |
| `ticket48_hmr_stale_instance` | #43 | `fix/hmr-stale-instance` |
| `ticket49_cfa_no_workspace_yaml` | #44 | `chore/cfa-scoped-release-age` (retain workspace/allowBuilds; name-only exclusions) |
| `ticket50_gateway_endpoint_docs` | #45 | `docs/gateway-endpoint-paths` (parts 1–2); `feat/api-v1-namespace` (rename, owner-decided, hard cut — no alias) |
| `ticket51_typegen_model_union_format` | #46 | `fix/typegen-format` |
| `ticket52_bedrock_mantle_routing` | #47 | `fix/bedrock-mantle-routing` |
| `ticket53_streaming_afterupstream_response` | #48 | `fix/streaming-afterupstream-response` |
| `ticket54_plugin_capture` | #49 | `feat/plugin-capture` |
| `ticket55_usage_reports` | #50 | `feat/plugin-usage-reports` (owner: ship as plugin) |
| `ticket56_plugin_roles` | #51 | `feat/plugin-roles` |
| `ticket57_key_budgets` | #52 | `feat/key-budgets` (owner: fold into plugin-api-keys; interim admin-only gate) |

Batch-4 note: ticket 23's #26 scope is REOPENED for implementation (usage-log apiKey
attribution) — the "deferral record" stage was wrong; ticket 17's marker work (`ae16964`)
unblocked it. Research revision goes in `ticket23_api_keys_plugin/research.md`.

Order for the batch-3 tickets (issues #20–31): 21 → 18 → 19 → 24 → 23 → 17 → 26 → 25 → 22 → 20
(21 first, isolated P0 on the core path; 26 reuses 21's e2e harness; 23's usage-log
attribution follows 17's marker work; 20 is a large feature gated on 13/21 behavior).

Order for the batch-5 tickets (issues #38–42 + ticket 39): 36 → 37 → 34 → 39 → 38 → 35
(37 hard-depends on 36's root `tools`; 36 lands before 35 so skills' conditional tool
registration composes on top of root tools; 39 is the `secret_text` credential-shape
P1 spun out of 38's research — 38 gates on it; 38 blesses both Brave and Exa per owner
decision). There is no ticket 33 folder — that number is the not-planned
unguessable-thread-ids entry in `issue_triage.md`.

Ticket-27 spin-out sequencing: 42 → 43 (43's mic control consumes 42's
`sdk.ai.transcribe()` and manifest `ai.transcribe: { model } | false`; 43's stages 1–3
are 42-independent, stages 4–5 gate on 42's stages 3/5 merging). If ticket 41's toast
API merges first, 43's error UX uses it; otherwise inline text per its step3. Owner
decisions for both are recorded in
`.idea/tickets/ticket27_ui_port/questions/q4_mic_input.md`.

Order for the batch-6 tickets (issues #44–#52): 53 → 52 → 51 → 50 → 49 → 54 → 55 → 56 → 57
(53 is a small P1 that hard-unblocks 54; 55's `groupBy=apiKey` gates on ticket 23's
attribution field; 57's field-level access depends on 56's `can()` — or ships behind an
interim admin-only gate; 57's per-key model allowlist layers on ticket 30's shipped
`allowlists` param at `resolveProvider`; 50's `/api/v1` rename question is an owner
decision, parts 1–2 ship regardless).

Q5 spin-out sequencing (tickets 44–47, rulings in
`ticket27_ui_port/questions/q5_port_strictness.md`): 44 → 47 → 41 → 45 → 46
(47 replaces the markdown engine and owns role-threading, so it lands before 41's
Shiki work — 41's docs get a revision entry when 47 merges; 46's PageContextButton
icon and 45's selector icons prefer 44's Firmware set; 46's `data-tool-selection`
deferral depends on 45's multi-select contract). Owner rulings binding on
implementers: Firmware icons win the 4 name collisions incl. live `MicIcon`;
ToolSelector is a multi-select availability picker, not Firmware's literal
prompt-injection menu; single line breaks are preserved in chat markdown.
