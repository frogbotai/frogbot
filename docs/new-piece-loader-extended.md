---
# Piece System Reconciliation — Plan & Progress

Goal: Reconcile firmware's piece system with ActivePieces 0.66: fix the regressed piece-loader to use registry-backed resolution, then migrate to a hybrid model where 42 vanilla pieces install from @activepieces/piece-* npm packages and 11 forked pieces remain in src/pieces/.

## Constraints & Preferences
- No DB storage for piece metadata (keep file-based JSON)
- Skip Payload type errors (pre-existing ~1135 baseline, will fix later)
- 11 forks stay in-tree: agent, browser-agent, forms, gmail, google-docs, google-drive, google-forms, google-sheets, google-slides, schedule, xero
- 42 vanilla pieces delete from src/pieces/ and install from npm
- mcp piece no longer needs to be a fork
- Conservative patch-pin npm versions (~x.y.z)
- Skip FlowTemplate → Template rename for now
- Waitpoint and engine-type migrations already done

## Architecture (target state)

```
packages/pieces/
├── package.json                     # npm deps: only pieces we DON'T fork
└── src/
    ├── pieces/                      # ONLY forked pieces live here (11)
    │   ├── agent/
    │   ├── browser-agent/
    │   ├── forms/
    │   ├── gmail/
    │   ├── google-docs/
    │   ├── google-drive/
    │   ├── google-forms/
    │   ├── google-sheets/
    │   ├── google-slides/
    │   ├── schedule/
    │   └── xero/
    ├── registry/
    │   ├── generated-registry.ts    # union: src/pieces/* overrides @activepieces/piece-*
    │   └── loader.ts                # loadPiece(name) — same API, dual-source resolution
    ├── metadata/
    │   └── pieces-metadata.json     # union: local forks (overrides) + npm pieces
    └── exports/server.ts

packages/pieces-framework-shim/       # pnpm override target
├── package.json                      # name: "@activepieces/pieces-framework"
└── src/index.ts                      # re-exports @firmware/pieces/framework
```

Resolution rule (single rule everywhere):
1. Does `src/pieces/<name>/` exist? → load from local TypeScript source
2. Else: is `@activepieces/piece-<name>` in node_modules? → load from npm
3. Else → PieceNotFoundError

---

## Stage 1 — Pre-flight fixes ✅ COMPLETE

### Plan
1. Revive `piece-loader.ts` from pre-80251d8b firmware version — restore `loadPiece` from `@firmware/pieces/server`, route through generated registry, drop AP filesystem scanning
2. Fix `flow-run.service.ts:512` — field rename `progressUpdateType:` → `streamStepProgress:`
3. Fix `flow-runs-api.ts` — replace removed `BulkRetryFlowRequestBody` with `BulkActionOnRunsRequestBody`
4. Fix `bulkRetryEndpoint.ts` — same replacement
5. Smoke-test flow execution

### Outcome
All 4 code fixes landed cleanly:
- `piece-loader.ts` — registry-backed resolution via `loadPieceFromRegistry`. AP filesystem scanning fully removed. `devPieces` param accepted but ignored (registry decides). `getPackageAlias` kept as `@deprecated` shim delegating to `getPieceNameFromAlias`.
- `flow-run.service.ts:517` — `streamStepProgress` field correct
- `flow-runs-api.ts:7,98` — `BulkActionOnRunsRequestBody` imported and used
- `bulkRetryEndpoint.ts:2,26` — already fixed (was listed as blocked but turned out to be done)
- Zero remaining references to `getPiecePath`, `findInDistFolder`, `traverseAllParentFoldersToFindPiece`, `pieceDistRoot`, `pieceIndexPath`

### Files changed
- `packages/flows/src/engine/helper/piece-loader.ts`
- `packages/flows/src/engine/helper/piece-helper.ts`
- `packages/flows/src/services/flow-run/flow-run.service.ts`
- `packages/flows/src/features/flow-runs/lib/flow-runs-api.ts`
- `apps/web/src/collections/FlowRuns/endpoints/bulkRetryEndpoint.ts`

### Key decisions
- Registry-backed loader over AP filesystem scanning — `generated-registry.ts` already maps all pieces; no `dist/` or `node_modules` traversal needed
- `devPieces` param kept in API signatures for AP 0.66 compatibility but ignored
- Piece name conversion: stored `piece-slack` → registry key `slack` via `getPieceNameFromAlias`
- i18n path initialization removed from `piece-helper.ts` — translations sourced from metadata generator

---

## Stage 2 — MCP migration ✅ COMPLETE

### Plan
Apply AP 0.66 rename map: `McpTool*` → `AgentTool*`, `McpToolType` → `AgentToolType`, `mcpToolNaming` → `mcpToolNameUtils`, `AgentPieceProps.AI_MODEL` → `AI_PROVIDER_MODEL`, remove dead shim types.

### Outcome
All renames applied. Zero remaining `McpToolType`, `McpPieceTool`, `McpFlowTool`, `McpPieceRunMetadata`, `McpFlowRunMetadata`, `McpRunStatus`, or `mcpToolNaming` imports from `@activepieces/shared` in source code.

Remaining `McpTool` references are only in:
- Payload-generated types (`payload-types.ts`) — auto-generated from DB collection slug `mcp-tools`, will regen later
- `@/payload-types` imports in `mcpEndpoint/index.ts` — correct, matches DB schema
- Component names like `McpToolTestingDialog` — firmware's own UI naming, already using AP 0.66 symbols internally

### Files changed
- `apps/web/src/collections/Flows/endpoints/mcpEndpoint/mcp-server.ts` — `McpTool`/`McpToolType`/`mcpToolNaming`/`McpPieceRunMetadata`/`McpFlowRunMetadata`/`McpRunStatus` → `AgentTool`/`AgentToolType`/`mcpToolNameUtils` + inline types. All dead commented-out code removed (~130 lines).
- `apps/web/src/collections/Flows/endpoints/mcpEndpoint/mcp-server-handler.ts` — `McpTool` → `AgentTool`
- `apps/web/src/collections/Mcps/utils.ts` — `McpToolType` → `AgentToolType`, dead `mcpToolNaming` removed, re-exports `mcpToolNameUtils`
- `apps/web/src/collections/McpTools/index.ts` — `mcpToolNaming.fixTool()` → `mcpToolNameUtils.createPieceToolName()`
- `packages/flows/src/components/TestStep/custom-test-step/mcp-tool-testing-dialog.tsx` — removed `mcpToolNaming` import, inlined `fixProperty` sanitization
- `packages/flows/src/exports/client.ts` — broken `McpTool` re-export → `AgentTool`
- `packages/flows/src/types/platform.ts` — removed 5 dead shim types (`AgentToolMetadata`, `AgentToolRequest`, `ListMcpsRequest`, `CreateMcpRequestBody`, `UpdateMcpRequestBody`)
- `packages/pieces/src/pieces/browser-agent/lib/actions/create-browser-agent.ts` — `AgentPieceProps.AI_MODEL` → `AI_PROVIDER_MODEL`, prop access `aiModel` → `aiProviderModel`
- `docs/activepieces-0.66-migration.md` — §2, §6, §7 updated to reflect completion

### Key decisions
- `mcpToolNaming.fixTool(name, id, type)` replaced with `mcpToolNameUtils.createPieceToolName(pieceName, actionName)` — different signature, AP 0.66 uses hash-based naming instead of ID-prefix truncation
- `McpPieceRunMetadata`/`McpFlowRunMetadata`/`McpRunStatus` removed from AP 0.66 — inlined as `Record<string, unknown>` + `'SUCCESS' | 'FAILED'` string literals
- Payload collection slug `mcp-tools` unchanged — DB migration not needed, types will regen
- New AP 0.66 concepts (`AgentMcpTool`, `AgentKnowledgeBaseTool`, `McpProtocol`, `McpAuthType`, `FieldControlMode`) already imported by `packages/flows/src/features/agents/` UI code from `@activepieces/shared` — no new firmware server-side usage needed

---

## Stage 3 — Framework compatibility prototype ✅ COMPLETE

### Plan
The one structural risk: npm pieces do `import { createPiece } from '@activepieces/pieces-framework'` but firmware has its own fork at `@firmware/pieces/framework`. If these resolve to different copies, class identity fails and the system breaks.

Prototype: install one `@activepieces/piece-*` from npm, verify it loads and serves metadata.

### Outcome — SUCCESS
**The shim approach works.** All npm piece `@activepieces/pieces-framework` imports resolve to firmware's fork via pnpm override.

Test results with `@activepieces/piece-slack@0.16.4`:
- `import('@activepieces/piece-slack')` — ✅ succeeded
- `piece.metadata()` — ✅ returned 26 actions, 14 triggers
- `piece.getAction('slack-add-reaction-to-message')` — ✅ found, props accessible
- `piece.getTrigger('new-message')` — ✅ found
- `instanceof Piece` — ❌ `false` (expected — compiled npm dist vs local TS source create different class instances)
- `constructor.name === 'Piece'` — ✅ `true` (this is what both AP and firmware actually use for extraction)

The `instanceof` failure is harmless because:
- Zero `instanceof Piece` checks exist anywhere in firmware's loader or engine
- Both AP's and firmware's `extractPieceFromModule` use `constructor.name === 'Piece'` string comparison
- `loader.ts` uses pure duck-typing (`piece.getAction()`, `piece.getTrigger()`)

Framework divergence analysis confirmed firmware's fork is a strict superset — every `createPiece()`, `createAction()`, `createTrigger()`, `Property.*`, `PieceAuth.*` call works identically. Firmware only adds: `minimumSupportedRelease` floor enforcement (internal), `CONNECTION_REGEX` export (additive), i18n barrel export blocked (pieces don't use it).

### Files created/changed
- `packages/pieces-framework-shim/package.json` — **NEW** shim package, `"name": "@activepieces/pieces-framework"`, depends on `@firmware/pieces` workspace
- `packages/pieces-framework-shim/src/index.ts` — **NEW** `export * from '@firmware/pieces/framework'`
- `package.json` — added pnpm override: `"@activepieces/pieces-framework": "workspace:@activepieces/pieces-framework@*"`
- `packages/pieces/package.json` — added `@activepieces/piece-slack@0.16.4` (test dep, will be joined by 41 more in Stage 4)
- `packages/utils/package.json` — fixed exports to point to `.ts` (was `.js`/`.d.ts`, broke shim resolution chain)
- `packages/pieces/scripts/test-npm-piece.ts` — **NEW** prototype test script (can delete after Stage 4)

### Key decisions
- **Shim + pnpm override** chosen over dual-framework or source-only approaches. `pnpm why` confirmed every `@activepieces/pieces-framework` dependency resolves to `link:../pieces-framework-shim`, including transitives through `pieces-common` and `common-ai`.
- `packages/utils/package.json` exports field was pointing to `.js`/`.d.ts` which don't exist at dev time — fixed to `.ts` to match how other workspace packages work. This was a pre-existing bug surfaced by the shim resolution chain.

### Critical context
- The npm piece is pre-compiled (dist/). Firmware's framework is TypeScript source. This creates the `instanceof` divergence, but both sides use `constructor.name` string matching, so it's safe.
- `pnpm.overrides` in root `package.json` applies workspace-wide — all 23 workspace projects get the same resolution.
- `@activepieces/pieces-common` also resolves `@activepieces/pieces-framework` through the shim (confirmed via `pnpm why`).

---

## Stage 4 — Piece reconciliation (structural change) ✅ COMPLETE

### Plan
13. Delete 42 vanilla folders from `packages/pieces/src/pieces/` ✅
14. Keep 11 forks: agent, browser-agent, forms, gmail, google-docs, google-drive, google-forms, google-sheets, google-slides, schedule, xero ✅
15. Add 42 `@activepieces/piece-*` deps to `packages/pieces/package.json` with patch-pinned ranges ✅
16. Rewrite `scripts/generate-registry.ts` ✅
    - Scan `src/pieces/*` → `() => import('../pieces/<name>')`
    - Scan `node_modules/@activepieces/piece-*` → `() => import('@activepieces/piece-<name>')`
    - Local wins on collision; assert unique keys
17. Rewrite `scripts/generate-metadata.ts` ✅
    - Dual-source (local first, then npm), dedup on name
    - Read version from `version.json` for forks, `package.json#version` for npm
    - Remove hardcoded `'1.0.0'`
    - Accept pnpm symlinked entries in `node_modules/@activepieces` (`Dirent.isDirectory() || Dirent.isSymbolicLink()`) so npm pieces are discovered reliably

### Outcome
All structural changes landed. Dual-source registry and metadata generators work correctly.

- `generate-registry.ts` — scans both `src/pieces/*` (local) and `node_modules/@activepieces/piece-*` (npm). Local overrides npm on collision. Generates `generated-registry.ts` with lazy `import()` loaders.
- `generate-metadata.ts` — dual-source metadata with pnpm symlink handling. 53/53 pieces loaded (11 local + 42 npm). 444 actions, 179 triggers.
- `generated-registry.ts` — 53 entries: 11 local (`../pieces/<name>`) + 42 npm (`@activepieces/piece-<name>`).
- Runtime validation via `extractPieceFromModule` (same codepath as engine):
  - Slack (npm): 26 actions, 14 triggers — `getAction`/`getTrigger` work
  - Gmail (local fork): 2 actions, 2 triggers — `getAction`/`getTrigger` work
  - Airtable (npm): 15 actions, 2 triggers — `getAction`/`getTrigger` work
  - Schedule (local fork): 0 actions, 6 triggers — `getTrigger` works
- `loader.ts` required zero changes — registry abstraction holds

### How the pipeline works (current → target)

**Current (all local source):**
```
generate-registry.ts → scans src/pieces/* → emits generated-registry.ts
generate-metadata.ts → scans src/pieces/* → imports index.ts → calls .metadata() → writes pieces-metadata.json
loader.ts → loadPiece('slack') → piecesRegistry['slack'].loader() → dynamic import
```

**Target (dual-source):**
```
generate-registry.ts → scans src/pieces/* AND node_modules/@activepieces/piece-* → emits generated-registry.ts
                        (local wins on collision)
generate-metadata.ts → scans both sources → imports piece → calls .metadata() → writes pieces-metadata.json
                        (reads version from version.json for local, package.json for npm)
loader.ts → NO CHANGES NEEDED — same loadPiece(name) → piecesRegistry[name].loader()
```

The loader doesn't care where a piece comes from — it just calls the registry entry's `loader()` function. The generators are the only things that need to know about dual sources.

### Pieces to delete from src/ and install from npm (42)
airtable, apollo, asana, cal-com, calendly, clockify, date-helper, discord, elevenlabs, github, gitlab, google-calendar, hubspot, http, jira-cloud, linear, linkedin, mcp, microsoft-teams, mongodb, neverbounce, notion, openai, postgres, quickbooks, resend, salesforce, sendgrid, shopify, slack, square, stripe, supabase, telegram-bot, text-helper, trello, twilio, twitter, webhook, whatsapp, youtube, zoom

---

## Stage 5 — Workflow tooling (deferrable)

18. `pnpm run pieces:add <name>` — `pnpm add @activepieces/piece-<name> + generate:all`
19. `pnpm run pieces:fork <name>` — copy `node_modules/@activepieces/piece-<name>/src/` → `src/pieces/<name>/`, rewrite framework imports, write `version.json`, drop npm dep, regenerate
20. Rewrite `scripts/diff-piece.sh` — diff `src/pieces/<name>/` vs `node_modules/@activepieces/piece-<name>/src/`
21. Retire `scripts/convert-piece.sh` (only for pieces not on public npm)
22. Update `PIECE_CONVERSION.md`, `SUB_AGENT_PIECE_CONVERSION_INSTRUCTIONS.md`, `SUB_AGENT_PIECE_UPDATE_INSTRUCTIONS.md`

---

## Stage 6 — Cleanup

23. Fix `metadataFetcher.ts` — call `PiecesMetadataSearch.getPieceByName` directly server-side instead of HTTP loopback
24. Delete `packages/pieces/src/registry/executor.ts` + `input-resolver.ts` (dead code)
25. Confirm `generated-registry.ts` gitignore vs commit policy matches `pieces-metadata.json`
26. Verify type error baseline hasn't regressed

---

## Validation checklist

- [x] Stage 1: piece-loader revived, engine type bugs fixed, no dead AP scanning code remains
- [x] Stage 2: no `McpTool*` imports from `@activepieces/shared`; `AgentTool*` consistent; migration doc updated
- [x] Stage 3: `@activepieces/piece-slack` loads from npm, `metadata()` returns 26 actions + 14 triggers, `getAction()`/`getTrigger()` work, framework shim resolves correctly
- [x] Stage 4: metadata generation loads expected 53 pieces (11 forks + 42 npm), including pnpm symlinked npm packages
- [x] Stage 4: registry loads npm pieces (slack, airtable) and local forks (gmail, schedule) via extractPieceFromModule
- [ ] Stage 4: all 11 forks + 42 npm pieces show in `/api/flows/pieces`
- [ ] Stage 4: flow with vanilla npm piece (e.g. slack) works end-to-end in running app
- [ ] Stage 4: flow with forked piece (e.g. gmail) works end-to-end in running app
- [ ] Stage 5: `pnpm pieces:add discord` works in <1 min
- [ ] Stage 5: `pnpm pieces:fork slack` round-trips correctly

---

## Risk register

| # | Risk | Status | Notes |
|---|------|--------|-------|
| 1 | Framework duplication | ✅ RESOLVED | Shim + pnpm override. Confirmed all transitive deps resolve to shim via `pnpm why`. |
| 2 | Transitive deps conflicts | ⚠️ WATCH | `@activepieces/piece-slack` installed cleanly (+24 pkgs). Watch dedupe on googleapis, zod, axios when adding 41 more. |
| 3 | AP 66-compatible piece versions | ⏳ PENDING | Need to look up AP's monorepo release tag for authoritative versions. May need different pins per piece. |
| 4 | Bundler interop (CJS/ESM) | ✅ RESOLVED | npm pieces ship CJS dist. Both metadata generation (53/53) and runtime registry loading (via `extractPieceFromModule`) confirmed working. |
| 5 | Metadata JSON size | ⏳ PENDING | Currently 65k lines. Will roughly double. Decide commit vs build-artifact policy at Stage 6. |
| 6 | `instanceof Piece` failure | ✅ RESOLVED | Confirmed harmless — zero `instanceof` checks in codebase, both AP and firmware use `constructor.name === 'Piece'` string matching. |

---

## Relevant files

### Stage 1
- `packages/flows/src/engine/helper/piece-loader.ts` — registry-backed resolution
- `packages/flows/src/engine/helper/piece-helper.ts` — cleaned up dead path logic
- `packages/flows/src/services/flow-run/flow-run.service.ts` — `streamStepProgress` field
- `packages/flows/src/features/flow-runs/lib/flow-runs-api.ts` — `BulkActionOnRunsRequestBody`
- `apps/web/src/collections/FlowRuns/endpoints/bulkRetryEndpoint.ts` — same

### Stage 2
- `apps/web/src/collections/Flows/endpoints/mcpEndpoint/mcp-server.ts` — full MCP migration
- `apps/web/src/collections/Flows/endpoints/mcpEndpoint/mcp-server-handler.ts`
- `apps/web/src/collections/Mcps/utils.ts`
- `apps/web/src/collections/McpTools/index.ts`
- `packages/flows/src/components/TestStep/custom-test-step/mcp-tool-testing-dialog.tsx`
- `packages/flows/src/exports/client.ts`
- `packages/flows/src/types/platform.ts`
- `packages/pieces/src/pieces/browser-agent/lib/actions/create-browser-agent.ts`

### Stage 3
- `packages/pieces-framework-shim/` — shim package (NEW)
- `package.json` — pnpm override for `@activepieces/pieces-framework`
- `packages/pieces/package.json` — `@activepieces/piece-slack` dep
- `packages/utils/package.json` — fixed exports
- `packages/pieces/scripts/test-npm-piece.ts` — prototype script

### Infrastructure (unchanged, needed by Stage 4)
- `packages/pieces/src/registry/loader.ts` — `loadPiece(name)`, no changes needed
- `packages/pieces/src/registry/generated-registry.ts` — auto-generated, will be rewritten by Stage 4
- `packages/pieces/src/metadata/pieces-metadata.json` — auto-generated, will be rewritten by Stage 4
- `packages/pieces/scripts/generate-registry.ts` — needs rewrite for dual-source
- `packages/pieces/scripts/generate-metadata.ts` — needs rewrite for dual-source
- `docs/activepieces-0.66-migration.md` — migration tracking

### Critical context
- `piece-loader.ts` was regressed in commit 80251d8b (AP 25→66 refactor) — revived in Stage 1
- `extractPieceFromModule` uses `constructor.name === 'Piece'` string check — not `instanceof`
- `@activepieces/piece-*` packages confirmed on public npm (latest piece-slack@0.16.4, 126 versions)
- Framework fork is strict superset of AP's — zero breaking changes for npm piece consumers
- `pnpm.overrides` applies workspace-wide across all 23 projects
