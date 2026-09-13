# Step 3: Development plan

Proceed after `Approved Step 2`, unless the owner has [skipped planning steps](FEATURE_DEVELOPMENT_PROCESS.md#when-to-use-this-process) or authorized batch planning. Deliver `step3_development_plan.md` in the feature's local planning folder.

## Objective

Break the approved approach into stages of related work. State what each stage needs, what it leaves unfinished, who can work on it, and how the finished feature will be tested.

## Structure

Read `research.md`, then link approved Steps 1–2 and requirements shared across tickets. Record the ticket branch/worktree, ticket-document folder, current approvals, and any instruction not to begin implementation.

For each numbered stage include:

- **Goal:** the result we can check and which requirements it satisfies.
- **Dependencies:** stages that must finish first and interfaces that must already exist.
- **Expected changes:** relevant files or areas, public API signatures when needed, and existing shared components or interfaces to reuse.
- **Intermediate checks:** what can be tested now and what must wait for a named later stage. State what will not be connected yet; do not require full suites to pass against intentionally unfinished work. For a bug, plan to reproduce the original failure before changing the code when feasible.
- **Work boundary:** related work that can share a subagent session, where a fresh session should start, and files that must not be edited concurrently.
- **Risks:** dependencies or test setup still needed. Settle unresolved product or design decisions in the earlier step, rather than leaving them as implementation TODOs.

## Guardrails

- Aim for stages of roughly an hour of focused work. Split by responsibility or verifiable outcome, never by an arbitrary code-line quota.
- If work exceeds roughly eight stages or a day, propose separate features with clear contracts and ordering.
- Tests and fixtures are part of implementation, not opt-in work requiring a separate request. Manual smoke tests complement automated coverage rather than replace it.
- Describe what each stage will change. Use short code or SQL examples when they clarify the plan. Do not implement the feature during planning.
- Identify any package rebuilds needed so integration checks do not use stale output.
- Plan lint/typecheck delegation to the `lint` subagent and the [contributor verification policy](../../CONTRIBUTING.md#verification). Do not have each implementation worker repeat repository-wide checks. Markdown-only work uses formatting, links, and content review instead of code lint/typecheck.

## Required ticket-level testing stage

Place this stage after the feature's parts work together, before calling the ticket complete. Assign a fresh agent the approved requirements, research, relevant source, and whole ticket diff. It should check the work independently, not rely on the implementer's claim that it is correct.

- **Required behavior (acceptance):** Show how each requirement will be checked. Choose unit, integration, and end-to-end tests that prove the relevant behavior.
- **Failure cases (adversarial):** Test realistic ways the feature could fail, chosen for their likelihood or consequences. Examples include missing permissions, invalid input, duplicate requests, retries, partial writes, and simultaneous requests. Explain why the selected cases matter; this is not a checklist every feature must satisfy.
- **Related behavior (regression):** Check existing behavior the change could break. For bug fixes, include the original failure and correct tests that previously expected the bug.

Name test files and commands, required test data and services, expected results, and any types of testing that do not apply. Browser tests apply to UI work; end-to-end tests can also exercise APIs and CLIs. Follow the [contributor testing rules](../../CONTRIBUTING.md#verification) for repeatable tests and real application checks. Do not invent a test-count target or add tests for unrelated, unchanged behavior.

Follow the [root test-placement rule](../../CONTRIBUTING.md#verification): new tests, fixtures, helpers, and test-only apps belong under root `test/`, not beside production code. Use the existing test layout and runner configuration.

For Markdown-only tickets, check formatting, links, examples, and whether the instructions agree with each other, rather than running application tests. Plan to handle findings using [When tests find a problem](../../CONTRIBUTING.md#when-tests-find-a-problem): fix broken promises, make agreed limitations clear, and ask before expanding the feature.

## Next

Deliver the plan, request `Approved Step 3`, and pause. Approval does not authorize Git operations or lift a planning-only/implementation hold. Never commit the local planning files. When implementation is authorized, read [Step 4](step4_implementation.md).
