# Step 1: Solution Assessment

## Problem

Expose useful usage reports without coupling FrogBot to a database adapter or replacing Payload's existing list/export capabilities.

## Option A: Direct adapter aggregation

- Pros: Database-side sums can be efficient at high volume.
- Cons: Drizzle excludes MongoDB and date/group syntax varies by adapter.

## Option B: Payload local API with in-memory reduction

- Pros: Adapter-neutral, matches Firmware, honors the resolved usage collection, and needs no schema migration.
- Cons: Scans matching rows for each report and may need future rollups at demonstrated scale.

## Option C: Persisted rollup collections

- Pros: Predictable report latency at high volume.
- Cons: Adds write coordination, migrations, reconciliation, and premature complexity.

## Recommendation

Use Option B. Ship a separate plugin with paginated `payload.find`, UTC date filtering, and in-memory model/user/API-key/day reduction. Enable Payload `admin.groupBy` and filtered CSV export through the official import/export plugin rather than duplicating those features.
