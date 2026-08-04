# Ticket 49 - Step 3: Development Plan

**Issue:** #44 | **Branch:** `chore/cfa-scoped-release-age` | **Research:** `./research.md` | **Step 1:** Option B

One Conventional Commit per stage. No lint or typecheck commands. No code comments.

## Stage 1 - Regression test

- **Goal:** Prove the generated workspace config is globally over-broad.
- **Dependencies:** none.
- **Changes:** update `packages/create-frogbot-app/src/index.spec.ts` to expect retained `allowBuilds`, absent `minimumReleaseAge`, and exact name-only exclusions; use `it.fails` for the red baseline.
- **Verification:** rebuild `create-frogbot-app`; run its focused spec and confirm the expected-failure test passes because the old content differs.
- **Risks/open questions:** exact content is intentional because the generated file is the public artifact; no open question.
- **Canonical contract:** packed scaffold output from `scaffold()`.
- **Commit:** `test(create-frogbot-app): cover scoped release-age exclusions`

## Stage 2 - Scoped workspace configuration

- **Goal:** Narrow the exemption without changing package-manager behavior.
- **Dependencies:** Stage 1.
- **Changes:** replace `minimumReleaseAge: 0` in `scaffold()`'s fixed YAML with `minimumReleaseAgeExclude` entries for `frogbot` and `'@frogbotai/*'`; restore the regression test from `it.fails` to `it`.
- **Verification:** rebuild the package; run the focused spec; scaffold a temporary app and inspect its emitted YAML.
- **Risks/open questions:** future package names outside the current namespace require explicit addition.
- **Canonical contract:** `scaffold()` remains the sole workspace-config generator.
- **Commit:** `fix(create-frogbot-app): scope release-age exclusions`

## Stage 3 - Final verification and implementation record

- **Goal:** verify no regression outside the focused boundary and record exact outcomes.
- **Dependencies:** Stage 2.
- **Changes:** add `step4_implementation_summary.md` with stage results, baseline failures, and skips.
- **Verification:** run `pnpm test`; run applicable scaffold/e2e verification without lint/typecheck; inspect git diff and status to ensure `CLAUDE.md` remains uncommitted.
- **Risks/open questions:** live gateway e2e depends on valid credentials; pre-existing failures are reported, not changed.
- **Canonical contract:** no production contract changes beyond generated YAML.
- **Commit:** `docs(tickets): record scoped release-age implementation`
