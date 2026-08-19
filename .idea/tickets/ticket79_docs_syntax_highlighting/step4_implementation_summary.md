## Stage 1 - Acceptance Fixtures
- Changes: Added expected-failure coverage for commands in plain-text fences and the seven migrations commands, plus passing fixtures for legitimate plain-text URL, directory-tree, TUI, and environment-variable content.
- Verification: `pnpm vitest run test/e2e/docsFences.e2e.spec.ts` passed with 4 tests green and 2 expected failures.
- Manual preview: Not applicable before the CSS and docs changes.

## Stage 2 - Dark-Mode Code Token Scope
- Changes: Excluded `pre` and `code` descendant spans from the dark-mode `#content-area` color rule while preserving the existing prose, paragraph, list, and container rules.
- Verification: `pnpm check:docs-fences` passed (`116 files and 743 fences scanned`); `git diff --check` passed.
- Manual preview: Limited: no `mintlify` CLI or repository docs-preview script is available locally. The selector no longer matches Shiki token spans under `pre code`, while non-code content-area spans retain `#cbd5e1 !important`.

## Stage 3 - Migration Command Fences
- Changes: Retagged exactly seven `npm run frogbot migrate...` fences in `docs/database/migrations.mdx` from `text` to `bash`.
- Verification: `rg -n '^```(bash|text)' docs/database/migrations.mdx` reported seven `bash` fences and zero `text` fences; `pnpm check:docs-fences` passed (`116 files and 743 fences scanned`); `git diff --check` passed.
- Manual preview: Limited: no local Mintlify preview command is available. These tags select Shiki's bash grammar once rendered.

## Stage 4 - Plain-Text Command Guard
- Changes: Extended `check-docs-fences.mjs` to inspect the first nonblank content line in `text`, `txt`, and `plaintext` fences and report known command prefixes while retaining the untagged-fence check and current fence pairing behavior.
- Verification: `pnpm check:docs-fences` passed (`116 files and 743 fences scanned`); `pnpm vitest run test/e2e/docsFences.e2e.spec.ts --testNamePattern "accepts legitimate plain-text fences|accepts tagged fences|reports an untagged fence location|finds no untagged fences in docs"` passed (4 tests, 2 skipped); `git diff --check` passed.
- Manual preview: Not applicable to the CLI guard. The full docs check covers all 18 existing legitimate plain-text fences without false positives.

## Stage 5 - Final Verification
- Changes: Enabled the acceptance tests, including command fixtures for all three plain-text aliases (`text`, `txt`, and `plaintext`).
- Verification: `pnpm vitest run test/e2e/docsFences.e2e.spec.ts` passed (6 tests); `pnpm check:docs-fences` passed (`116 files and 743 fences scanned`); `pnpm format:check` passed; `git diff --check` passed.
- Manual preview: Limited: `mintlify` is not installed and the repository has no docs preview or docs build script. No relevant build command exists; the CSS selector review confirms Shiki spans under `pre` or `code` are excluded while prose spans retain the dark-mode contrast rule.
