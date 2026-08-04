# Step 2: Feature Description

## Problem

Usage logs are visible only as raw records, so authenticated operators cannot compare model and user cost/token usage over a chosen period.

## User Stories

- As an operator, I want model usage totals so that I can understand cost and token distribution.
- As an operator, I want user usage totals so that I can identify active and expensive users.
- As an operator, I want preset and custom date ranges so that I can inspect a relevant reporting period.
- As an operator, I want raw filtered CSV export and list grouping so that I can continue analysis with Payload's standard tools.

## Core Requirements

- Ship as `@frogbotai/plugin-usage-reports` and use the marker-resolved usage collection.
- Read all matching pages through Payload's local API and reduce in memory; never access Drizzle directly.
- Provide authenticated report access with validated UTC bounds and model, user, day, and attributed API-key grouping.
- Port Firmware's date-range control and sortable models/users tables without its unrelated portfolio, histogram, or subscriptions surfaces.
- Enable Payload list grouping and official filtered raw-row export without changing usage-log ownership.

## Shared Component Inventory

- Usage-log collection: extend its admin configuration; do not fork the collection.
- Payload custom admin views: register the Usage Analytics page through the canonical `admin.components.views` contract.
- Payload import/export plugin: configure export-only behavior for the resolved usage collection.
- Firmware UsageAnalytics: port DateRangePicker, ModelBreakdown, and AllUsers behavior and styling; omit fields with no FrogBot equivalent.

## User Flow

1. Install and configure the usage reports plugin after any attribution plugin.
2. Open Usage Analytics from the Payload admin navigation.
3. Choose Models or Users and select a preset or custom date range.
4. Sort the resulting totals, or use the usage-log list for grouping and filtered CSV export.

## Success Criteria

- Reports return correct sums across multiple local-API pages and an empty range returns empty tables.
- Custom usage-log slugs and populated relationship IDs work without adapter-specific access.
- Unauthenticated requests receive 401 and malformed ranges receive 400.
- The admin page matches the scoped Firmware interaction on desktop and mobile.
- Focused tests, full tests, build, and applicable e2e complete successfully or have exact skips reported.
