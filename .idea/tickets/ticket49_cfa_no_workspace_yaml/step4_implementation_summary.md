# Ticket 49 - Step 4: Implementation Summary

## Stage 1 - Regression test

- **Changes:** Replaced the old global-opt-out golden assertion with the reviewed scoped YAML contract and landed it as `it.fails`.
- **Verification:** `pnpm --filter create-frogbot-app build` passed; focused Vitest reported 4 passed and 1 expected failure, proving the old generator violated the new contract.
- **Notes:** Commit `9b01c0d` (`test(create-frogbot-app): cover scoped release-age exclusions`).

## Stage 2 - Scoped workspace configuration

- **Changes:** Retained `pnpm-workspace.yaml` and both `allowBuilds` entries; replaced `minimumReleaseAge: 0` with name-only exclusions for `frogbot` and `'@frogbotai/*'`; restored the regression to normal `it`.
- **Verification:** Package build passed; focused Vitest passed 5/5; a real `scaffold()` invocation against the packed template emitted the exact expected file.
- **Notes:** Commit `ceb164d` (`fix(create-frogbot-app): scope release-age exclusions`). No CLI, README, package-manager detection, or package pin changes.

## Stage 3 - Final verification and implementation record

- **Changes:** Recorded implementation, test outcomes, and pre-existing e2e failures.
- **Verification:** `pnpm build` passed across 65 workspace projects. `pnpm test` passed: 328 files and 2,296 tests passed; 13 files and 111 tests skipped; 3 expected failures; 56 todo. Focused scaffold e2e passed 6/9 and failed on three unrelated existing paths: provider reasoning-content rejection, `FrogbotChatTransport` test construction using the removed `apiBase` shape, and the stale `/api/ai/v1/models` assertion returning 500 after the namespace change. The pre-change full e2e baseline passed 49 tests, skipped 3, and failed 9: those two scaffold failures plus seven live gateway credential/model-access failures. Live gateway e2e was not rerun after the final change because this ticket cannot affect it and valid provider access was unavailable.
- **Notes:** No lint or typecheck commands were run. The workspace build's own Next.js phases printed their built-in lint/type-validity step and passed. The e2e-generated `templates/blank/src/frogbot-types.ts` change was removed. The user's `CLAUDE.md` modification remains uncommitted and untouched.
