# Step 3: Development plan

Proceed after `Approved Step 2`, unless the owner has [skipped planning steps](FEATURE_DEVELOPMENT_PROCESS.md#when-to-use-this-process) or authorized batch planning. Deliver `step3_development_plan.md` in the feature's local planning folder.

## Objective

Turn the approved approach into cohesive implementation stages with explicit dependencies, intermediate states, handoff boundaries, and a dedicated ticket-level testing stage.

## Structure

Read `research.md`, then link approved Steps 1–2 and applicable program contracts. Record the ticket branch/worktree, canonical artifact folder, current approvals, and any implementation hold.

For each numbered stage include:

- **Goal:** the observable result and acceptance criteria it satisfies.
- **Dependencies:** prerequisite stages and contracts that must already exist.
- **Expected changes:** relevant files/domains, public signatures when needed, and canonical components/contracts to reuse.
- **Intermediate checks:** checks that meaningfully apply now and validation deferred until named dependent stages complete. Record expected incomplete wiring; do not require broad suites to pass against deliberately transitional work. For a bug, plan proof of the actual pre-fix mechanism before changing it when feasible.
- **Work boundary:** related work that can share a subagent session, where a fresh session should start, and files that must not be edited concurrently.
- **Risks:** unresolved dependencies or environmental requirements. Product/architecture blockers belong in the earlier gate, not an implementation TODO.

## Guardrails

- Aim for stages of roughly an hour of focused work. Split by responsibility or verifiable outcome, never by an arbitrary code-line quota.
- If work exceeds roughly eight stages or a day, propose separate features with clear contracts and ordering.
- Tests and fixtures are part of implementation, not opt-in work requiring a separate request. Manual smoke tests complement automated coverage rather than replace it.
- Describe what each stage will change. Use short code or SQL examples when they clarify the plan. Do not implement the feature during planning.
- Identify any package rebuilds needed so integration checks do not use stale output.
- Plan lint/typecheck delegation to the `lint` subagent and the [contributor verification policy](../../CONTRIBUTING.md#verification). Do not have each implementation worker repeat repository-wide checks. Markdown-only work uses formatting, links, and content review instead of code lint/typecheck.

## Required ticket-level testing stage

Place this stage after the ticket's behavior is coherent, before completion or Git handoff. Assign a fresh verification agent the approved requirements, research, relevant source, and whole ticket diff; it should challenge the implementation independently of the worker's reasoning.

| Pass        | Required plan                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acceptance  | Map each requirement to observable assertions. Use unit tests for logic, integration tests for real boundaries, and relevant E2E tests for changed user/API/CLI journeys.                                           |
| Adversarial | Identify plausible ways the feature can fail, with justified cases such as missing permissions, invalid inputs, cold starts, duplicate requests, retries, partial failures, persistence/read-back, and concurrency. |
| Regression  | Exercise adjacent affected behavior. For bugs, include the original failure and any tests that previously asserted the broken behavior.                                                                             |

Name test files/commands, environment and fixture needs, expected outcomes, and justified non-applicable layers. Browser flows apply to UI work; E2E is not limited to browsers. Prefer deterministic fixtures at external boundaries; do not mock the internal behavior being proven. No arbitrary test-count quota or busywork tests for unchanged behavior.

Follow the [root test-placement rule](../../CONTRIBUTING.md#verification): new tests, fixtures, helpers, and test-only apps belong under root `test/`, not beside production code. Use the existing test layout and runner configuration.

For Markdown-only tickets, this stage verifies formatting, links, examples, and instruction/content consistency rather than application behavior. Verification failures return to implementation and re-verification; they cannot be dismissed by weakening assertions or silently reducing approved scope.

## Next

Deliver the plan, request `Approved Step 3`, and pause. Approval does not authorize Git operations or lift a planning-only/implementation hold. Never commit the local planning files. When implementation is authorized, read [Step 4](step4_implementation.md).
