Piece System Reconciliation — Research Complete
I have a full picture now. Let me lay out the situation and propose options.
Current state of firmware pieces
Aspect
Where pieces live
How pieces run at runtime
Where metadata comes from
DB storage for pieces
Upgrade workflow
Vanilla vs customized flag
Dual-loader bug
Version handling
What you actually want
1. Most pieces → don't maintain an in-tree copy, easy upgrade path
2. Some pieces (gmail) → copy-and-customize
3. Still no DB storage
4. Still no runtime install
The core architectural choice
There are three viable approaches. Each trades off upgrade ease against local control:
Option A — Hybrid: npm for vanilla + in-tree for customized (closest to AP's DEV_PIECES model)
- Add @activepieces/piece-slack, @activepieces/piece-notion, etc. as normal npm dependencies in packages/pieces/package.json
- Keep src/pieces/<name>/ only for pieces you've intentionally forked (gmail, a future agent piece, etc.)
- A manifest (e.g. src/pieces/customized.json or just "folder exists = customized") drives which name resolves from where
- Registry generator and metadata generator both read: customized-tree first, then fall back to installed npm packages
- Upgrade for vanilla: pnpm up @activepieces/piece-slack — done
- Upgrade for customized: keep using diff-piece.sh
Pros: True separation. Vanilla pieces upgrade via npm version bump. You only maintain forks.
Cons: Requires wiring npm packages into both the registry loader and the metadata generator. Adds 400+ transitive deps if you adopt the full AP catalog. Bundle size balloons unless you only install pieces you actually use. AP's official npm packages ship compiled JS — you give up the ability to easily step through TS source.
Option B — Git submodule of AP monorepo + in-tree customized pieces
- Add activepieces as a git submodule at vendor/activepieces/
- Registry generator + metadata generator scan src/pieces/ first, fall back to vendor/activepieces/packages/pieces/community/<name>/src/
- Upgrade: git submodule update --remote (gets the whole catalog at once)
- Customizations still live in src/pieces/<name>/ and override
Pros: Stay on TypeScript source for everything. Zero npm install overhead. One command upgrades all vanilla pieces at once.
Cons: Submodule ergonomics are annoying. AP pulls in their entire build (nx, big tree). You inherit their dependency graph wholesale. Tree-shaking friendliness depends on how the resolver handles submodule paths.
Option C — Status quo + explicit vanilla/customized flag
- Keep porting everything into src/pieces/ via convert-piece.sh (unchanged)
- Add an explicit marker: e.g. src/pieces/<name>/.customized file, or a customized: true field in version.json
- diff-piece.sh uses it to categorize pieces: vanilla → "safe to auto-overwrite on upgrade", customized → "manual merge"
- Add a bulk-upgrade command: for every piece without the customized flag, nuke the local copy and re-import fresh from upstream
- Also fix the dead piece-loader.ts path (either delete it or route through the registry loader)
Pros: Minimal architectural change. No new dependencies. You already have the diff tooling.
Cons: You still maintain a copy of every piece in git (hefty repo). Bulk upgrade is scripted but still touches lots of files.
---
Secondary issues that need addressing regardless of option
1. The broken filesystem loader (packages/flows/src/engine/helper/piece-loader.ts): the flow engine's action/trigger/props/auth execution all go through this, and it cannot resolve any piece in firmware's current layout. Either:
   - Delete it entirely and route all engine sites through loadPiece from packages/pieces/src/registry/loader.ts
   - Or rewrite findInDistFolder / traverseAllParentFoldersToFindPiece to understand firmware's layout
2. metadataFetcher.ts doing HTTP loopback — server-side code fetches /api/flows/pieces/:name over HTTP instead of calling PiecesMetadataSearch directly. Trivial to fix but worth noting.
3. version.json is orphaned — generator hardcodes '1.0.0'. If you care about version display in the UI, plumb it through.
4. Registry is git-ignored but metadata is committed — inconsistent. Pick one policy.
---
Questions before I draft a full plan
# Questions
Which reconciliation approach best fits your goals?
A — npm + in-tree forks (Recommended)
If you go with Option A (npm), how many pieces do you realistically need?
I only need the ones I have in th repo right now, but yes I need a robust way to easy expand the ones imported from activpes maybe all the way up all 400+ peices, and as i said a way to over write locally, ithink the surface area of how these are loaded when used in the engine and when metadata is quired
Should the plan include fixing the broken `packages/flows/src/engine/helper/piece-loader.ts`?
Doesnt this follow the code in /Users/colbygilbert/Documents/Code/activepieceCur/packages/server/engine/src/lib/helper/piece-loader.ts the orginal activpeice repo; I realize you are saying ti doesnt work witht he current firmware code, and they would make sense becuase I am in the middle of a major migration t update from activepeice 25 to 66 you can you a few commit back to see the orgina [iece loader that worke for firmware, we deccide it best we can more this file back or posrtion fo it back
How should we distinguish vanilla pieces from forked ones?
does the custome fodler mean its a dev pice does custom peice overivride community peices?
# Git log for firmware piece-loader
$ git log --oneline --all -- packages/flows/src/engine/helper/piece-loader.ts 2>/dev/null | head -30
80251d8b refactor(flow/engine): update engine to most current activepieces code
eff84440 wip(web/flows): init move engine code to flow package
# Follow piece-loader history across renames
$ git log --all --oneline --follow 2>/dev/null -- "*/piece-loader.ts" | head -40
80251d8b refactor(flow/engine): update engine to most current activepieces code
eff84440 wip(web/flows): init move engine code to flow package
55881edf feat/dump: browser agent piece
f6357ca8 wip(web): make dev react app and debug adding a connection
d4bd1aaf wip(web): revamp engine, ui updates
d51964e8 wip(web/pieces): initial port of engine and pieces-framework
# Check earlier piece-loader commits
$ git show eff84440 --stat 2>/dev/null | head -10 && git log d51964e8 eff84440 --oneline 2>/dev/null | head -10
commit eff844406b561b33a415d3151532391f44b2f7db
Author: Colby Gilbert <colby@firmware.ai>
Date:   Mon Mar 9 19:42:26 2026 -0700
    wip(web/flows): init move engine code to flow package
 .../app-connection.service.ts                      |   5 +-
 .../endpoints/startFromExtensionEndpoint.ts        |   2 +-
 .../src/collections/FlowRuns/flow-run.service.ts   |   6 +-
 .../builder/src/mock-data/mock-flow-with-loops.ts  | 138 ----
…
Click to expand
# Look at original firmware piece-loader
$ git show d51964e8:packages/web/src/lib/engine/helper/piece-loader.ts 2>/dev/null | head -100
(no output)
# Find original piece-loader location
$ git show d51964e8 --stat 2>/dev/null | rg "piece-loader|piece-helper" | head -20
zsh:1: command not found: rg
# Find when piece-loader was added
$ git log --all --diff-filter=A --name-only --format="%H %s" 2>/dev/null | rg -B1 "piece-loader.ts" | head -30
zsh:1: command not found: rg
# Find when piece-loader was added
$ git log --all --diff-filter=A --name-only --format="%H %s" 2>/dev/null | grep -B1 "piece-loader.ts" | head -30
apps/web/src/collections/Flows/engine/helper/piece-helper.ts
apps/web/src/collections/Flows/engine/helper/piece-loader.ts
# History of original piece-loader
$ git log --all --follow --oneline apps/web/src/collections/Flows/engine/helper/piece-loader.ts 2>/dev/null | head -10
(no output)
# Log for original piece-loader
$ git log --all --oneline -- apps/web/src/collections/Flows/engine/helper/piece-loader.ts 2>/dev/null | head -20
eff84440 wip(web/flows): init move engine code to flow package
55881edf feat/dump: browser agent piece
f6357ca8 wip(web): make dev react app and debug adding a connection
d4bd1aaf wip(web): revamp engine, ui updates
d51964e8 wip(web/pieces): initial port of engine and pieces-framework
# Commits touching findInDistFolder
$ git log --all --oneline -S "findInDistFolder" 2>/dev/null | head -20
80251d8b refactor(flow/engine): update engine to most current activepieces code
# Check if 80251d8b modified piece-loader
$ git show 80251d8b --stat 2>/dev/null | grep piece-loader
packages/flows/src/engine/helper/piece-loader.ts   | 190 ++++---
# Show previous piece-loader before last refactor
$ git show 80251d8b^:packages/flows/src/engine/helper/piece-loader.ts 2>/dev/null | head -150
import path from 'path'
import { Action, Piece, PiecePropertyMap, Trigger } from '@firmware/pieces'
import { loadPiece as loadPieceFromRegistry } from '@firmware/pieces/server'
import {
  ActivepiecesError,
  ErrorCode,
  ExecutePropsOptions,
  extractPieceFromModule,
  getPackageAliasForPiece,
  isNil,
…
Click to expand
Found it — there was a previous version of the firmware piece-loader that used loadPieceFromRegistry (from @firmware/pieces/server) and took a pieceSource param. The last refactor (80251d8b) to "most current activepieces code" regressed it to pure AP filesystem scanning, losing firmware's registry integration.
# Show getPiecePath logic from previous version
$ git show 80251d8b^:packages/flows/src/engine/helper/piece-loader.ts 2>/dev/null | sed -n '140,200p'
return pieceName
    }
    return getPackageAliasForPiece({
      pieceName,
      pieceVersion,
    })
  },
  getPiecePath: async ({ packageName, pieceSource }: GetPiecePathParams): Promise<string> => {
…
Click to expand
Now I have the complete picture. Here's the history:
Previous firmware piece-loader.ts (pre-80251d8b):
- Had pieceSource: string param ('FILE' or 'DB')
- When 'FILE': just stripped "piece-" prefix and returned the folder name → handed to loadPieceFromRegistry(pieceName) from @firmware/pieces/server → which used generated-registry.ts to dynamic-import the piece
- When 'DB': fell back to AP's filesystem walk (for installed custom pieces — unused in firmware)
The recent AP 25→66 refactor (commit 80251d8b) regressed it to pure AP filesystem scanning and dropped the registry integration entirely. That's the bug.
---
Final Plan
Chosen approach (Option A + fixes)
Answers to your questions:
- Folder convention: src/pieces/custom/<name>/ = your forked (dev) piece. It overrides any vanilla npm piece of the same name. src/pieces/<name>/ (flat) continues working for already-ported pieces during migration. The custom folder is firmware's equivalent of AP's DEV_PIECES list — except rather than an env var, the folder's mere existence declares "use my local copy."
- Loader fix: port the pre-80251d8b firmware piece-loader logic back and adapt it for the new AP 66 API. That loader already did exactly what we need — route through loadPiece from @firmware/pieces/server for dev/in-tree pieces.
- npm install model: only pieces we actually use (start with current 53). Must be trivial to expand toward 400+ without code changes.
---
Architecture
packages/pieces/
├── package.json                     # npm deps: @activepieces/piece-* per piece we use
├── node_modules/
│   └── @activepieces/
│       ├── piece-slack/             # vanilla community pieces (just npm installed)
│       ├── piece-notion/
│       └── ...
└── src/
    ├── pieces/
    │   └── custom/                  # forked pieces (firmware "dev pieces")
    │       ├── gmail/                ├── lib/, i18n/, index.ts, version.json
    │       ├── agent/                # firmware-exclusive pieces go here too
    │       └── browser-agent/
    ├── registry/
    │   ├── generated-registry.ts    # regenerated: union of custom/ + installed npm @activepieces/piece-*
    │   └── loader.ts                # loadPiece(name) — same API, new resolution
    ├── metadata/
    │   └── pieces-metadata.json     # regenerated: union of custom/ (overrides) + npm
    └── exports/server.ts
Resolution precedence (single rule everywhere)
1. Is <name> a folder under src/pieces/custom/? → use that (TS source, watches, hot edits)
2. Else is @activepieces/piece-<name> installed in node_modules? → use that (prebuilt npm package)
3. Else → PieceNotFoundError
---
Execution steps
Phase 1 — Fix the broken engine loader
1. Revert packages/flows/src/engine/helper/piece-loader.ts to the pre-80251d8b firmware version that uses loadPieceFromRegistry. Adapt type shapes to the AP 66 engine (parameter name changes, etc.). Replace the old pieceSource: 'FILE' | 'DB' param with the new devPieces: string[] pattern from AP 66, but keep the registry-backed resolution.
2. Update all call sites (piece-executor.ts:78, piece-helper.ts:49/167/193, trigger-helper.ts:296) to pass devPieces derived from which pieces live under src/pieces/custom/.
3. Either delete AP_DEV_PIECES env var support or keep it as an additional override.
Phase 2 — Restructure piece storage
4. Create packages/pieces/src/pieces/custom/ directory.
5. Move existing forked pieces into it. Candidates for customization (based on what needs local divergence): agent, browser-agent, forms, schedule, webhook, mcp, gmail (and any piece with meaningful local changes).
6. Delete the other vanilla-ported pieces from src/pieces/<name>/ flat layout. These will come from npm instead.
Phase 3 — Enable npm-backed pieces
7. Add the corresponding @activepieces/piece-* packages to packages/pieces/package.json for each piece we currently have. Version pinned to match AP 66 release line.
8. Rewrite scripts/generate-registry.ts to:
   - Scan src/pieces/custom/ → emits dynamic-import entries pointing at ../pieces/custom/<name>
   - Scan node_modules/@activepieces/piece-* → emits dynamic-import entries pointing at the npm package name
   - Custom always wins on name collision
9. Rewrite scripts/generate-metadata.ts similarly: load each piece (custom first, else npm), call .metadata(), merge into pieces-metadata.json. Honor version.json for custom pieces, use the npm package's package.json version for vanilla.
Phase 4 — Workflow tooling
10. Add pnpm run pieces:add <name> — installs @activepieces/piece-<name> at the latest AP-66-compatible version, regenerates registry + metadata.
11. Add pnpm run pieces:fork <name> — copies from node_modules/@activepieces/piece-<name>/ into src/pieces/custom/<name>/ (flattened, framework imports rewritten), adds version.json, tells you what to customize.
12. Replace scripts/convert-piece.sh behavior. Now it takes AP upstream source (from newPieces/) only when you want a brand-new custom fork — otherwise pieces:add handles it.
13. Rewrite scripts/diff-piece.sh to diff custom pieces against their npm counterpart (node_modules/@activepieces/piece-<name>/) instead of the updatePieces/ staging dir. Bumping vanilla is now just pnpm up @activepieces/piece-<name>.
Phase 5 — Clean up residual debt
14. Fix packages/flows/src/services/piece-metadata/metadataFetcher.ts — stop HTTP-looping; call PiecesMetadataSearch.getPieceByName directly when running server-side.
15. Wire version.json through generate-metadata.ts (currently hardcoded '1.0.0').
16. Decide: commit generated-registry.ts for reproducibility, or keep git-ignoring it. Match policy with pieces-metadata.json.
17. Delete packages/pieces/src/registry/executor.ts + input-resolver.ts (dead code) or finish wiring them.
18. Update PIECE_CONVERSION.md and the sub-agent instructions files to reflect the new custom/ workflow.
Phase 6 — Validation
19. Spot-check a vanilla piece end-to-end: piece metadata appears in /api/flows/pieces, can be added to a flow, runs successfully at flow-execution time.
20. Spot-check a custom piece with the same name as a vanilla one — confirm custom wins.
21. Spot-check the upgrade path: pnpm up @activepieces/piece-notion, re-run generate:all, verify new fields/actions show up without touching our code.
---
Open decisions
# Questions
Do you know if @activepieces/piece-* packages are actually published to npm, and at what version? This blocks the entire plan.
Need to verfiy this, idk if that is the case, use web search
Which current pieces should become custom forks (everything else reverts to npm)?
browser-agent, schedule, xero, gmail, google-docs, google-sheets, google-drive, google-forms, google-slides, agent, forms, mcp, also do we really need to put the oer pices in piece/custom? can we just put the in the folder /pieces?
How do you want to sequence the rollout?
two phases, but this still isnt clear to me, arent we deleteing all unneed peices why have pieces in src/pieces/ and src/pieces/custom, whay have src/pieces/custom at all?
◈ Exa Web Search "@activepieces/piece-slack npm package registry published"
# Check if AP piece packages exist on npm
$ curl -sI https://registry.npmjs.org/@activepieces/piece-slack 2>&1 | head -5 && echo "---" && curl -s https://registry.npmjs.org/@activepieces/piece-slack 2>&1 | head -c 500
HTTP/2 200
date: Sat, 25 Apr 2026 22:41:24 GMT
content-type: application/json
cf-ray: 9f20dadfbad0a60a-PDX
cf-cache-status: REVALIDATED
---
{"_id":"@activepieces/piece-slack","_rev":"137-cfa264e05707e1ce568cdbfee26ef03b","name":"@activepieces/piece-slack","dist-tags":{"latest":"0.16.4"},"versions":{"0.0.0-pre1":{"name":"@activepieces/piece-slack","version":"0.0.0-pre1","_id":"@activepieces/piece-slack@0.0.0-pre1","maintainers":[{"name":"khaledmashaly","email":"k.m.mashaly@gmail.com"},{"name":"abuaboud","email":"code@activepieces.com"}],"dist":{"shasum":"49fd074d1e0c792b1ed880e31ddbc65b4999f412","tarball":"https://registry.npmjs.org/
Good — both confirmations back:
1. Public npm confirmed. @activepieces/piece-slack@0.16.4 is the latest. All community pieces are published to @activepieces/piece-* on public npm. ✅
2. You're right about custom/ — it's unnecessary. The folder's existence in src/pieces/ is already the signal. No subfolder needed.
Revised Plan
Simpler architecture
packages/pieces/
├── package.json                     # npm deps: only pieces we DON'T fork
└── src/
    ├── pieces/                      # ONLY forked pieces live here
    │   ├── agent/
    │   ├── browser-agent/
    │   ├── forms/
    │   ├── gmail/
    │   ├── google-calendar/         # if you want these customized too
    │   ├── google-docs/
    │   ├── google-drive/
    │   ├── google-forms/
    │   ├── google-sheets/
    │   ├── google-slides/
    │   ├── mcp/
    │   ├── schedule/
    │   └── xero/
    ├── registry/
    │   ├── generated-registry.ts    # union: src/pieces/* overrides @activepieces/piece-*
    │   └── loader.ts
    └── metadata/
        └── pieces-metadata.json
Resolution rule (one rule, everywhere)
For piece <name>:
1. Does src/pieces/<name>/ exist? → load from local TypeScript source (this IS your fork/dev piece)
2. Else: is @activepieces/piece-<name> in node_modules? → load from installed npm package
3. Else: PieceNotFoundError
No env vars. No flags. No customized.json marker. The folder's existence is the marker.
Your keep-as-fork list (12 pieces)
agent, browser-agent, forms, gmail, google-docs, google-drive, google-forms, google-sheets, google-slides, mcp, schedule, xero
To-be-deleted-from-src-and-installed-from-npm (41 pieces)
airtable, apollo, asana, cal-com, calendly, clockify, date-helper, discord, elevenlabs, github, gitlab, google-calendar, hubspot, http, jira-cloud, linear, linkedin, microsoft-teams, mongodb, neverbounce, notion, openai, postgres, quickbooks, resend, salesforce, sendgrid, shopify, slack, square, stripe, supabase, telegram-bot, text-helper, trello, twilio, twitter, webhook, whatsapp, youtube, zoom
Execution steps
Phase 1 — Fix the loader (ship first, verify flows still work)
1. Revert packages/flows/src/engine/helper/piece-loader.ts to the pre-80251d8b firmware version that imports loadPiece from @firmware/pieces/server and uses the registry.
2. Adapt the revived loader to AP 66's API (parameter shapes from the current version), but keep the registry-backed resolution. Replace old pieceSource: 'FILE' | 'DB' with a simple "always use registry" path since the registry now handles both source-of-truth cases internally.
3. Remove devPieces param plumbing from piece-executor.ts, piece-helper.ts, trigger-helper.ts, engine-constants.ts:76,115. No longer needed — the registry decides.
4. Delete findInDistFolder, traverseAllParentFoldersToFindPiece, AP_CUSTOM_PIECES_PATHS references.
5. Smoke-test: confirm a flow with at least one piece action + piece trigger still runs end-to-end.
Phase 2 — Migrate to npm-backed vanilla + keep forks in src/pieces/
6. Add @activepieces/piece-<name> to packages/pieces/package.json dependencies for all 41 "delete" pieces. Pin versions compatible with AP 66 release line (e.g. ~0.16.0 range where appropriate).
7. Delete the 41 folders from src/pieces/. Keep only the 12 forks.
8. Rewrite scripts/generate-registry.ts:
   - Scan src/pieces/*/index.ts → emits () => import('../pieces/<name>') entries
   - Scan node_modules/@activepieces/piece-* → emits () => import('@activepieces/piece-<name>') entries
   - Local src/pieces/ always wins on name collision
9. Rewrite scripts/generate-metadata.ts:
   - Load each piece via the same precedence (local first, then npm)
   - Call .metadata() to extract
   - Read version from version.json for local, from package.json for npm
   - Emit merged pieces-metadata.json
10. Update @firmware/pieces/server exports if needed so loadPiece(name) still routes through the generated registry.
Phase 3 — Workflow scripts (deferrable)
11. Add pnpm run pieces:add <name> — pnpm add @activepieces/piece-<name> + generate:all. One command to adopt any of the 400+ AP pieces.
12. Add pnpm run pieces:fork <name> — copies node_modules/@activepieces/piece-<name>/src/ → src/pieces/<name>/, rewrites framework imports, writes version.json, removes the npm dep (since local now wins).
13. Rewrite diff-piece.sh to diff src/pieces/<name>/ against node_modules/@activepieces/piece-<name>/src/ (current installed npm version). Upgrade vanilla = pnpm up @activepieces/piece-<name>; upgrade fork = run diff, merge, bump version.json.
14. Retire/simplify convert-piece.sh — now only used for pieces not yet on npm (rare edge case).
15. Update PIECE_CONVERSION.md, SUB_AGENT_PIECE_CONVERSION_INSTRUCTIONS.md, SUB_AGENT_PIECE_UPDATE_INSTRUCTIONS.md for the new flow.
Phase 4 — Minor cleanup (can bundle with Phase 2)
16. Fix packages/flows/src/services/piece-metadata/metadataFetcher.ts to call PiecesMetadataSearch.getPieceByName directly when server-side, not HTTP-loopback.
17. Wire real version.json into generate-metadata.ts (replaces hardcoded '1.0.0' at line 164).
18. Delete dead code: packages/pieces/src/registry/executor.ts (broken, unused) and input-resolver.ts (fully commented).
19. Decide commit policy for generated-registry.ts: keep git-ignored (fine; it's a build artifact) and ensure CI regenerates it during build.
Validation checklist
- [ ] Phase 1: existing flow with slack-send-message action runs end-to-end (currently probably broken)
- [ ] Phase 2: /api/flows/pieces returns 53+ pieces, split between local forks and npm
- [ ] Phase 2: adding a new flow with a vanilla piece (e.g. piece-slack) works
- [ ] Phase 2: adding a new flow with a forked piece (e.g. piece-gmail) works
- [ ] Phase 2: delete src/pieces/gmail/, re-run generate:all, confirm the npm version shows up in metadata with the npm version string (test override disambiguation works)
- [ ] Phase 3: pnpm run pieces:add discord installs and registers a brand-new piece in under a minute
- [ ] Phase 3: pnpm run pieces:fork gmail round-trips correctly
Risks / unknowns
1. AP 66 framework compatibility. Firmware has @firmware/pieces/framework (forked copy of @activepieces/pieces-framework). The published npm pieces import { createPiece } from '@activepieces/pieces-framework'. You need to either:
   - (a) Make @firmware/pieces/framework API-compatible with @activepieces/pieces-framework and alias it via tsconfig paths / package.json overrides / pnpm aliases
   - (b) Import the real @activepieces/pieces-framework npm package alongside your fork
   - This is the one big compatibility concern. Worth a small prototype before Phase 2.
2. Piece transitive deps. Each @activepieces/piece-* package pulls its own dependencies (slack SDK, google APIs, etc.). Many of those you already have in packages/pieces/package.json. Expect deduplication cleanup.
3. Bundling pieces in Next.js. The registry's () => import('@activepieces/piece-slack') needs Next/Turbopack/webpack to traverse into node_modules/@activepieces/piece-*/dist — verify its build output format (likely CommonJS). If it ships as CJS, dynamic import works; verify no ESM/CJS interop issue with createPiece export shape.
4. Version drift. AP may release a breaking piece-framework change between minor versions. Your pin strategy (~0.16 vs ^0.16) matters.
Ready for me to proceed with Phase 1? Or want to prototype the framework-compatibility check (risk #1) first?
