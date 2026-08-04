# Step 3: Development Plan

**Branch:** `fix/typegen-format`

## Stage 1: Regression Proof

- Goal: encode the missing final-format pass before changing implementation.
- Dependencies: existing type-generation filesystem harness and model catalog.
- Expected changes: add expected-failure coverage proving long model unions do not wrap; add passing guards for short inline unions and deterministic second writes where existing coverage is absent; record the suite-level formatting gap.
- Verification: run the focused type-generation spec and confirm the new expected-failure case reports the pre-fix defect while the suite remains green.
- Risks/open questions: assert structural formatting rather than a catalog snapshot so model-data updates do not create churn.
- Contract: `writeGeneratedTypes` output and deterministic write result.

## Stage 2: Format the Final Artifact

- Goal: make one formatter own all generated TypeScript output.
- Dependencies: Stage 1.
- Expected changes: add Prettier as an explicit FrogBot runtime dependency; format the assembled schema declarations, extra type strings, and FrogBot footer in `compileTypes`; activate the regression test; align footer assertions with the configured single-quote output; update the implementation summary.
- Verification: run the focused type-generation spec, FrogBot package tests, full `pnpm test`, the workspace build, and non-live e2e coverage where applicable.
- Risks/open questions: the additional formatter pass is CLI-only; inspect lockfile changes to ensure only dependency metadata changes.
- Contract: `compileTypes`, `buildGeneratedTypesFooter`, and `writeGeneratedTypes`; no runtime or generated type-membership changes.
