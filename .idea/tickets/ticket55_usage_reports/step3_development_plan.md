# Step 3: Development Plan

**Branch:** `feat/usage-reports`

## Stage 1: Planning and Package Contract Tests

- Goal: Lock the plugin configuration and report behavior before implementation.
- Dependencies: Current main includes usage-log markers and API-key attribution.
- Expected changes: Add Steps 1-3 and tests for plugin composition, resolved slugs, endpoint access/validation, pagination, sums, and optional API-key attribution.
- Verification: Run the focused package spec with expected-failure tests before implementation.
- Risks or open questions: None.
- Canonical contract: FrogBot `Plugin`, Payload `Endpoint`, and marker-resolved usage collection.

## Stage 2: Adapter-Neutral Report API

- Goal: Implement reliable model, user, day, and API-key usage totals.
- Dependencies: Stage 1 tests.
- Expected changes: Add `usageReportsPlugin(options)`, authenticated endpoints, ISO range validation, paginated `payload.find`, relationship ID normalization, and in-memory reduction.
- Verification: Make Stage 1 API tests pass and run the focused package suite.
- Risks or open questions: Large ranges remain an accepted O(n) scan until profiling justifies rollups.
- Canonical contract: Payload local API only; no adapter internals.

## Stage 3: Payload Admin Integrations

- Goal: Reuse Payload's list grouping and raw-row CSV export.
- Dependencies: Stage 2 plugin and official import/export package.
- Expected changes: Merge `admin.groupBy`, register export-only import/export for the resolved collection, preserve existing collection/admin/plugin config, and test composition.
- Verification: Run focused plugin and configuration tests.
- Risks or open questions: Import/export remains subject to Payload's jobs configuration.
- Canonical contract: Payload `admin.groupBy` and `importExportPlugin`.

## Stage 4: Firmware-Parity Admin View

- Goal: Port the requested date-range, models table, and users table slice.
- Dependencies: Stage 2 endpoints and Payload custom-view/import-map contracts.
- Expected changes: Add client exports, nav link, custom view, responsive styles, preset/custom UTC ranges, sortable totals, loading, empty, error, and unauthorized states.
- Verification: Add focused component tests and build the package client/server exports.
- Risks or open questions: User labels use available auth fields and fall back to IDs; Firmware-only firm/plan columns are excluded.
- Canonical contract: Firmware DateRangePicker, ModelBreakdown, and AllUsers interactions.

## Stage 5: Documentation and End-to-End Verification

- Goal: Publish configuration and verify the complete workspace integration.
- Dependencies: Stages 1-4.
- Expected changes: Add package README, Mintlify plugin page/navigation, usage and attribution caveats, and the implementation summary.
- Verification: Run focused/full tests, build, and applicable e2e without direct lint/typecheck commands; report exact skips.
- Risks or open questions: External database/service e2e may require unavailable credentials.
- Canonical contract: Existing plugin docs and package export conventions.
