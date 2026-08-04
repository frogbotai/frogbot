# Research: Usage analytics reporting over `usage_logs` (issue #50)

**Status:** researched
**Revision:** 2026-08-03 — owner DECIDED core-vs-plugin: ship as `@frogbotai/plugin-usage-reports` (usage *logging* stays core; reporting is a plugin, matching the api-keys precedent). 2026-08-03 — implementation review confirmed ticket 23 has since landed on current main: `plugin-api-keys/src/index.ts:52-57,91-98` injects and populates the indexed `apiKey` relationship, so API-key grouping is now available when that plugin is installed.
**Ticket:** .idea/issue_triage.md → Ticket 55
**Branch (planned):** `feat/usage-reports`

## Issue Summary

`usage_logs` (frogbot's per-request AI cost/token log) has no consumer beyond the raw
admin list. Finance/platform users cannot answer "cost per user/key/model over a date
range" without SQL. Issue body proposed a full aggregation endpoint + admin page + CSV
export; the **owner's follow-up comment is authoritative and revises the plan**: (1)
turn on Payload's experimental `admin.groupBy` on the usage collection for free visual
grouping (no SUM); (2) adopt `@payloadcms/plugin-import-export` for filtered CSV export
of raw rows (also no SUM); (3) build only a custom SUM/aggregation endpoint
(`GET /api/usage/report?groupBy=user|apiKey|model|day&from&to`) plus a minimal admin
page, since grouping and export now come from Payload primitives already in
`node_modules` (Payload 3.85.1 is the pinned version here).

## Reproduction

N/A — feature request, not a regression. Verified by inspection that no aggregate
consumer of `usage_logs` exists today (see Complete Path Audit).

## Current Behavior (our code)

### Usage-log collection shape (issue's claimed fields/indexes — confirmed exact)

`packages/frogbot/src/ai/usageCollection.ts:15-70` (`defaultUsageCollection`):

```
{ name: "user", type: "relationship", relationTo: userSlug, index: true }        // :30
{ name: "thread", type: "relationship", relationTo: threadsSlug, index: true }   // :34-37 (conditional)
{ name: "requestId", type: "text", required: true, index: true }                 // :40
{ name: "runId", type: "text", index: true }                                     // :41
{ name: "model", type: "text", required: true, index: true }                     // :42
{ name: "operation", type: "select", required: true, options: [...] }            // :43-58
{ name: "inputTokens" | "outputTokens" | "cachedInputTokens" | "cacheWriteTokens"
  | "reasoningTokens" | "totalTokens", type: "number", ... }                     // :59-64
{ name: "costUSD", type: "number", defaultValue: 0, required: true }             // :65
{ name: "finishReason", type: "text" }                                          // :66
{ name: "requestedAt", type: "date", required: true, index: true }              // :67
```

Indexes present: `user` (:30), `thread` (:36), `requestId` (:40), `runId` (:41),
`model` (:42), `requestedAt` (:67). The issue's claim of indexes on
`api_key_id`/`user_id`/`model`/`requested_at` is **partially disproven**: there is no
`apiKey` field on this collection at all today — see below — so no `api_key_id` index
exists to group by. `user`, `model`, `requestedAt` indexes are confirmed present.

### API-key attribution

Core usage logs do not define an API-key field, preserving plugin neutrality. Ticket 23
has landed on current main: `packages/plugins/plugin-api-keys/src/index.ts:52-57`
injects an indexed `apiKey` relationship and `:91-98` copies the authenticated key id
into `context.usageFields`, which core logging already persists. Reports may therefore
group by `apiKey` when the field is present, but must not require or inject it.

### Marker-based resolution (ticket 17, already shipped — issue's premise mostly holds)

`packages/frogbot/src/ai/usageCollection.ts:72-104` (`resolveUsageCollection`) resolves
by `usageLog: true` marker (`:76-78`), not hardcoded slug, and returns
`{ collections, slug }`. `packages/frogbot/src/types/collection.ts:52,56`:
`usageLog?: boolean;` and `COLLECTION_MARKERS` includes `'usageLog'`. The resolved slug
flows to `logUsage.ts:17`: `collection: req.frogbot.config?.ai?.usage?.slug ??
USAGE_LOGS_SLUG` and is stored at sanitize time,
`packages/frogbot/src/config/sanitize.ts:1094`: `ai: sanitizedAI && { ...sanitizedAI,
usage: { slug: usageSlug } }`. **Any report endpoint must read the collection slug from
`req.frogbot.config.ai.usage.slug` (or the sanitized config it is given), never the
`USAGE_LOGS_SLUG` constant** — the constant is only the un-overridden default.

### No aggregate primitive exists locally

`grep -rn "aggregate\|\bsum(" packages/frogbot/src` (run during this research) returns
no matches outside gateway cost-calculation helpers — confirms the issue's core claim
that nothing today can SUM `costUSD`/tokens grouped by anything.

### Existing custom-endpoint precedent

`packages/frogbot/src/agents/endpoints.ts:34-38` (`buildAgentEndpoints`) shows the
established shape for a FrogBot-authored custom endpoint returning an array of
`{ path, method, handler }` merged into Payload's `endpoints` array
(`packages/frogbot/src/config/sanitize.ts:114`: `endpoints: Endpoint[] | false |
undefined`). The report endpoint should follow this same construction pattern
(`buildUsageReportEndpoints()` analog) rather than inventing a new registration
mechanism.

## Root Cause

Not a bug — a missing capability. The "root cause" framing is: `usage_logs` is written
but never read in aggregate; Payload's local API (`find`/`count`/`findDistinct`) has no
SUM primitive, so nothing in this repo's existing seams can answer a GROUP-BY-SUM
question without new code.

## Source of Truth and Ownership

The **owning invariant**: the resolved usage-collection slug
(`req.frogbot.config.ai.usage.slug`), never a hardcoded constant — already established
by ticket 17 and must be reused, not re-derived, by the new endpoint. The **aggregation
strategy** must be a single implementation that works across every DB adapter frogbot
ships (see below) — not a SQL-only fast path with a silently-broken Mongo path.

## Complete Path Audit

- **SQLite/Postgres/D1/Vercel-Postgres deployments** (frogbot ships `db-sqlite`,
  `db-postgres`, `db-d1-sqlite`, `db-vercel-postgres` — all thin wrappers, see below):
  drizzle direct GROUP BY is *possible* but adapter-specific date-bucketing SQL differs
  (SQLite `strftime`/`date()` vs Postgres `date_trunc`) — a raw-SQL approach needs
  per-adapter branching or an adapter-agnostic query builder.
- **MongoDB deployments** (`db-mongodb` — also shipped, see below): there is no
  `drizzle` property on the adapter at all; a `payload.db.drizzle`-based implementation
  throws/no-ops on Mongo. This must be handled or explicitly documented as unsupported.
- **Cold start / empty collection**: `GROUP BY` over zero rows must return `[]`, not
  error — verify test coverage.
- **Composable groupBy** (`user,model`): both Payload's `groupBy` admin option and a
  hand-rolled SQL/JS aggregator support only a single field in Payload's own
  implementation (see Reference Behavior); composite grouping is entirely custom to
  this endpoint, not delegated to Payload.
- **`?format=csv` on the aggregation endpoint** vs. plugin-import-export's own
  raw-row CSV: these are two different exports (aggregated report vs. raw rows) and
  must not be conflated in the admin page — the issue's tier 2/3 split keeps them
  separate deliberately.
- **Access control**: no RBAC exists yet (issue #51, unimplemented — see below); the
  endpoint must use the same `Boolean(req.user)` gate as the base collection's `read`
  access (`usageCollection.ts:24`) for parity, not invent an admin-only check that
  nothing else in the repo can express yet.

## Assumption Audit

- **Fields/indexes as issue describes** — **VERIFIED for tokens/costUSD/model/
  operation/user/thread/requestedAt**; `usageCollection.ts:30-67`.
- **Index on `api_key_id`** — **DISPROVEN**: no `apiKey` field exists on the collection
  today; `usageCollection.ts:15-70` (full field list, grep confirms no `apiKey`/`key`
  field). This is real scope the owner's plan omitted; it is tracked in ticket 23's
  reopened scope, not this ticket — flagged as a dependency, not invented here.
- **`admin.groupBy` exists, is experimental, backed by `findDistinct`** — **VERIFIED**:
  `payload/packages/payload/src/collections/config/types.ts:537-542`: "@description
  Enable grouping by a field in the list view. Uses `payload.findDistinct` under the
  hood... @experimental... beta and may change in future releases." (Issue's cited line
  `:410` is stale/wrong — current checkout has it at `:542`; same field, same
  behavior — not load-bearing on the line number.)
- **`admin.groupBy` is visual grouping with per-group pagination, not aggregation
  (no SUM)** — **VERIFIED** by the same docstring (only mentions `findDistinct`, a
  distinct-values op, not `sum`); cross-checked
  `payload/packages/payload/src/collections/operations/findDistinct.ts:38,167,192` —
  `findDistinctOperation` calls `payload.db.findDistinct`, which returns distinct field
  values only, no numeric aggregation anywhere in this file.
- **`@payloadcms/plugin-import-export` provides column-selection, filtered, jobs-based
  CSV/JSON export** — **VERIFIED**: `payload/packages/plugin-import-export/src/
  index.ts:34-77` registers `exports`/`imports` upload collections and pushes
  `getCreateCollectionExportTask`/`getCreateCollectionImportTask` into
  `config.jobs.tasks` (jobs-based, confirmed at `:76-77`); `batchProcessor.ts:32` takes
  a `where?: Where` filter and `:83` a `columns: string[]` allowlist — column
  selection and filtering both real.
- **Payload's local API has no SUM/aggregate op — only find/count/findDistinct** —
  **VERIFIED** by directory listing of
  `payload/packages/payload/src/collections/operations/` (find.ts, count.ts,
  findDistinct.ts present; no aggregate.ts/sum.ts) and by the absence of any `sum`
  export from `payload/packages/payload/src/index.ts` grepped during this research.
- **The aggregation "needs a custom endpoint that goes through the drizzle adapter
  directly"** (owner's comment, tier 3) — **DISPROVEN as the only or best strategy**.
  Countervailing evidence, both load-bearing:
  1. Frogbot ships a MongoDB adapter as a first-class package
     (`packages/db-mongodb/package.json`: `"dependencies": {"@payloadcms/db-mongodb":
     "3.85.1"}`), confirmed exercised by its own suite
     (`packages/db-mongodb/src/index.spec.ts`). Payload's Mongo adapter has no
     `drizzle` property (`payload/packages/db-mongodb/src/index.ts:193,220,289`
     define/initialize a Mongoose `connection`, never `drizzle`) — a drizzle-only
     implementation is a hard no-op/crash on every Mongo deployment, which frogbot
     genuinely supports (`packages/db-mongodb` is a real, tested package, not a stub).
  2. **Firmware — the prior iteration of this exact product — already solved this
     exact problem, and did not use drizzle.** Per CLAUDE.md's Firmware UI-parity rule,
     Firmware is the spec; here it is also a *backend* precedent for the identical
     "SUM usage_logs grouped by X over a date range" problem:
     `firmware/apps/web/src/endpoints/analytics/utils.ts:1-44` (`fetchUsageLogs`) pages
     through `payload.find({ collection: 'api-usage-logs', where: {...}, limit: 5000,
     ... })` — the plain Payload local API, not `payload.db.drizzle` — and
     `firmware/apps/web/src/endpoints/analytics/utils.ts:75,125`
     (`aggregateUserUsage`/`aggregateModelUsage`) do the SUM/GROUP BY **in JS, in
     memory**, consumed by `firmware/apps/web/src/endpoints/analytics/models.ts:9,29`
     (`aggregateModelUsage(usageLogs)`). This is adapter-agnostic by construction (it
     never touches the DB layer directly) and is the only concrete prior
     implementation of "usage report over usage_logs" in any repo consulted.
  Verdict: the drizzle-direct path is real for SQL adapters (`payload.db.drizzle` does
  exist on drizzle-family adapters —
  `payload/packages/db-sqlite/src/index.ts:138`: `drizzle: undefined,` populated at
  connect time, and `payload/packages/drizzle/src/types.ts:395`: `drizzle: LibSQLDatabase
  | PostgresDB` on `DrizzleAdapter`) but it is **not adapter-agnostic**, and the owner's
  comment did not account for frogbot's shipped Mongo adapter. Firmware's in-memory
  `payload.find` + JS-reduce approach is strictly more portable and has a working
  precedent; it trades some performance at very large row counts for correctness across
  every adapter frogbot ships. The owner's own issue text explicitly says rollup tables
  are premature "until someone demonstrates the GROUP BY is slow" — the same
  premature-optimization logic argues for starting with the portable `payload.find` +
  in-memory aggregation, with a drizzle fast-path as a documented, adapter-gated
  optimization only if/when profiling calls for it on SQL deployments.
- **No RBAC/admin role concept exists to gate the endpoint** — **VERIFIED**: issue #51
  (`gh issue view 51`) proposes `@frogbotai/plugin-roles` as unimplemented future work
  ("Proposal: ... composable RBAC..."); grep of `packages/frogbot/src/config/sanitize.ts`
  and `types/config.ts` for `role`/`isAdmin` finds no such concept today. The report
  endpoint's access control is therefore scoped to `Boolean(req.user)` parity with the
  base collection (`usageCollection.ts:24`), same as every other admin-only surface in
  this repo today — an admin-only check is a v2 concern gated on #51 landing, not
  inventable here.
- **Frogbot re-exports/wraps Payload plugins elsewhere today** (precedent check for
  "adopt plugin-import-export") — **DISPROVEN as an existing pattern**: repo-wide grep
  (`grep -rn "@payloadcms/plugin" packages --include="*.json" --include="*.ts"`,
  excluding `node_modules`/`dist`) returns no matches — frogbot has never wrapped a
  `@payloadcms/plugin-*` package before. Adopting `plugin-import-export` is a new
  precedent (peer dependency exposed to end users, or frogbot injects it into the
  built Payload config the way `resolveUsageCollection` injects collections) —
  **INFERRED, not load-bearing**: which integration shape (peer-dep the user installs
  and configures vs. frogbot auto-wiring it onto the usage collection) is a step1/step2
  design decision, not something this ticket's fix direction can determine from source
  alone.
- **Firmware has a usage/analytics admin UI to port** — **VERIFIED**:
  `firmware/apps/web/src/views/UsageAnalytics/index.tsx:1-20` is a five-tab
  (`portfolio`/`models`/`users`/`histogram`/`subscriptions`) client component with a
  `DateRangePicker`, per-tab fetch of `/api/analytics/{portfolio,models,users,
  histogram,subscriptions}`, and `isSuperAdmin` gating
  (`index.tsx:40-41`: `const isSuperAdmin = user?.roles?.includes('super-admin')`). This
  is broader than what this ticket is scoped to build (no subscriptions/histogram
  concept exists in frogbot; no `roles` field exists per the RBAC-gap finding above).
  Firmware is still the spec per CLAUDE.md, but only for the slice this ticket actually
  builds: a **single date-range-picker + grouped/sortable table** view is the direct
  analog of Firmware's `models.tsx`/`AllUsers.tsx` tables, not the full 5-tab dashboard.
  `DateRangePicker.tsx` and the models/users table components are the concrete
  components to port for shape (props, date-range state, table columns), scoped down;
  histogram/subscriptions tabs have no frogbot equivalent concept and are out of scope.

No load-bearing assumption is unresolved to the point of blocking a fix direction: the
one **INFERRED** item (plugin-import-export integration shape) is a design choice for
step1, not a fact the fix's correctness depends on.

## Reference Behavior

- **Payload `admin.groupBy`**: `payload/packages/payload/src/collections/config/
  types.ts:537-542` — one-line experimental flag, `findDistinct`-backed, no aggregation.
  Confirmed non-composable (single field) by the option's own type: `groupBy?: boolean`
  is a collection-level flag, not a field list — Payload's admin UI internally decides
  which field to group by via list-view UI state, not multi-field composition. (This
  is why groupBy cannot answer `groupBy=user,model` — only the custom endpoint can.)
- **`@payloadcms/plugin-import-export`**: `payload/packages/plugin-import-export/src/
  index.ts` full plugin — registers collections + jobs, no relevance to SUM/aggregation,
  confirmed scoped to raw-row export only (`batchProcessor.ts` streams `docs`, never
  reduces).
- **Firmware's analytics backend** (`firmware/apps/web/src/endpoints/analytics/*.ts`,
  `utils.ts`): the closest available real-world precedent for exactly this feature —
  paginated `payload.find` + in-memory `Map`-based reduction, no drizzle, no Mongo
  aggregation pipeline. Confirms an adapter-agnostic implementation is the proven path,
  not merely a theoretical fallback.
- **LiteLLM / Helicone / Portkey** (issue's own comparison) — not independently
  re-verified against their source in this research pass (out of the given repo/URL
  set for this assignment); the issue's framing that "reports over usage metadata are
  table stakes" is accepted as directionally true without re-deriving it, since it is
  not load-bearing on this ticket's fix shape (the fix shape is set by Payload's actual
  primitives + Firmware's precedent, both directly inspected above).

## Proposed Fix Direction

Three independent, sequenceable pieces per the owner's revised (comment) plan:

1. **`admin.groupBy: true`** added to `defaultUsageCollection`'s returned config
   (`usageCollection.ts:18-25` area) — one line, guarded as experimental in a code
   comment/doc, not gated behind any new frogbot config flag (matches "one-line config
   change" framing in the issue).
2. **Import/export**: a step1-level decision (peer dependency the app owner wires up
   themselves vs. frogbot auto-injecting `importExportPlugin({ collections: [usageSlug]
   })` the way `resolveUsageCollection` auto-injects the collection). Either way, no new
   aggregation code — this is Payload's plugin as-is.
3. **Aggregation endpoint** (the only new code):
   - New module, e.g. `packages/frogbot/src/ai/usageReport.ts`, exporting
     `buildUsageReportEndpoints()` following the `buildAgentEndpoints()` shape
     (`agents/endpoints.ts:34-38`).
   - Reads the collection slug from `req.frogbot.config.ai.usage.slug` (never a
     constant) per ticket 17's established contract.
   - Implementation: paginated `req.frogbot.find({ collection: slug, where: { and:
     [requestedAt >= from, requestedAt <= to] }, depth: 0, limit: <page size> })` +
     in-memory `Map`-based reduction keyed by the composable `groupBy` fields (`user`,
     `apiKey` once ticket 23 lands it, `model`, or a day-bucket derived from
     `requestedAt` in JS with a date library already in the dependency tree, avoiding
     any SQL date-function divergence) — directly modeled on
     `firmware/apps/web/src/endpoints/analytics/utils.ts` and `models.ts`.
   - `?format=csv` on this endpoint serializes the aggregated rows (distinct from
     plugin-import-export's raw-row CSV).
   - Access: `Boolean(req.user)`, matching `usageCollection.ts:24`; upgrade to an
     admin-only check when #51 ships a role primitive — do not invent one now.
   - A documented note (in the endpoint's own comment-free doc string is not allowed
     per CLAUDE.md; put it in step2/step docs instead) that a future drizzle-backed fast
     path is an optional SQL-only optimization, not required for correctness.

**Rejected**: drizzle-direct `GROUP BY ... SUM(...)` as the sole implementation —
breaks every Mongo deployment silently (no `drizzle` property to reach), contradicted
by frogbot's own shipped `db-mongodb` package and by Firmware's own working precedent
using the portable `payload.find` path instead.

## Why Tests Missed It

N/A — feature, not a regression.

## Regression Tests That Prove the Issue

N/A framing does not apply cleanly (feature ticket) but step3 should specify, at
minimum:
- A spec exercising the new endpoint against both a seeded SQLite test instance
  (existing frogbot test harness pattern) and asserting correct SUM/grouping by
  `user`, `model`, and day-bucket, including the empty-range → `[]` case.
- A spec asserting the endpoint resolves the collection via
  `req.frogbot.config.ai.usage.slug` when a `usageLog: true` marker renames the
  collection (regression guard against re-introducing the constant-slug bug ticket 17
  fixed elsewhere).
- If frogbot's CI runs a Mongo variant of its integration suite, the same aggregation
  spec must pass there too — confirming adapter portability rather than assuming it.

## Risks / Open Questions

- API-key grouping is meaningful only when `plugin-api-keys` is installed and has
  attributed the rows; the reports plugin does not create or infer attribution.
- Plugin-import-export integration shape (peer dep vs. auto-wired) is unresolved and
  should be an explicit step1 decision, not assumed.
- Day-bucketing in JS (vs. SQL date functions) needs a timezone policy decision (UTC
  day boundaries, matching `requestedAt`'s ISO string storage
  `logUsage.ts`: `requestedAt: new Date(args.startedAt).toISOString()`).
- At very large row counts, paginated `payload.find` + in-memory reduction is O(n) scan
  per report call; the issue itself says rollup tables are premature until this is
  demonstrated slow — flag as a known, accepted trade-off, not a blocker.

## Scope Check

- **Issue requests** (as revised by owner comment): (1) `admin.groupBy` on-liner, (2)
  adopt `plugin-import-export`, (3) custom SUM aggregation endpoint + minimal admin
  page.
- **This repo can own**: all three — no external blockers identified.
- **Deferred/blocked**: `groupBy=apiKey` pending ticket 23's field; admin-only access
  control pending issue #51's RBAC; full Firmware-parity multi-tab dashboard
  (histogram/subscriptions) is explicitly out of scope — no frogbot concept maps to
  those tabs.
- No new acceptance criteria invented beyond the owner's comment scope.

## Sources

- `packages/frogbot/src/ai/usageCollection.ts`
- `packages/frogbot/src/ai/logUsage.ts`
- `packages/frogbot/src/types/collection.ts`
- `packages/frogbot/src/config/sanitize.ts`
- `packages/frogbot/src/agents/endpoints.ts`
- `packages/db-sqlite/package.json`, `packages/db-mongodb/package.json`
- `.idea/tickets/ticket17_usage_logs_role_marker/research.md`
- `.idea/tickets/PROCESS.md` (batch-4 note re: ticket 23 reopened scope)
- `/Users/colbygilbert/Documents/Code/payload/packages/payload/src/collections/config/types.ts`
- `/Users/colbygilbert/Documents/Code/payload/packages/payload/src/collections/operations/findDistinct.ts`
- `/Users/colbygilbert/Documents/Code/payload/packages/plugin-import-export/src/index.ts`
- `/Users/colbygilbert/Documents/Code/payload/packages/plugin-import-export/src/export/batchProcessor.ts`
- `/Users/colbygilbert/Documents/Code/payload/packages/db-sqlite/src/index.ts`
- `/Users/colbygilbert/Documents/Code/payload/packages/db-mongodb/src/index.ts`
- `/Users/colbygilbert/Documents/Code/payload/packages/drizzle/src/types.ts`
- `/Users/colbygilbert/Documents/Code/firmware/apps/web/src/views/UsageAnalytics/index.tsx`
- `/Users/colbygilbert/Documents/Code/firmware/apps/web/src/endpoints/analytics/{utils,models,portfolio,users,histogram,types}.ts`
- `gh issue view 50 --repo frogbotai/frogbot` (body + owner comment)
- `gh issue view 51 --repo frogbotai/frogbot` (RBAC proposal, unimplemented)
