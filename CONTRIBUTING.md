# Contributing to FrogBot

Shared engineering conventions for contributors and coding agents. Read this guide before editing, plus [UI conventions](packages/ui/CONTRIBUTING.md) when working in `packages/ui`.

## Development workflow

- Read the current code and applicable domain constraints below before proposing changes. Use the configured `pnpm` version and Node requirement from [package.json](package.json).
- This guide covers coding and verification. Small, direct changes do not require a ticket or planning documents.

## Git commits

- Never stage or commit anything under `.idea/`. Ticket research, plans, and implementation summaries are local planning state. Reusable process instructions live in `.github/feature-process/` and belong in version control.
- Preserve existing worktree and index changes. No per-stage commits or proposed commit messages; finish a verified ticket with one commit only when authorized. Merging into `main`, pushing, or opening a PR also requires explicit authorization.
- Use Conventional Commits format: `type(scope): message`
  - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `build`, `ci`, `style`
  - Scope: the package or area (e.g. `gateway`, `frogbot`, `payload-plugin`)
  - Examples: `refactor(gateway): move tool helpers into translators/`, `feat(gateway): add retry-after header support`
- Do NOT use freeform prefixes like `gateway: ...` — always include the type
- Do NOT add the opencode attribution footer to commit messages
- Keep commit messages clean and focused on the actual changes
- Only include the commit message content, no additional attribution or co-authored-by lines
- In multi-feature programs, commit each completed and verified F feature separately; never combine multiple F features in one commit

## Code style

- **Crisp, clean code**: Favor simplicity over complexity
- **Remove dead code**: Don't retain unused logic or buggy compatibility paths just in case
- **Consistent naming**: Use clear, consistent patterns (e.g., `createTextDoc`/`updateTextDoc`)
- **Object parameters**: Prefer object params over multiple individual params for better maintainability

### Blank lines

- **Favor more breathing room, not fewer lines. When a blank line is debatable, add it.** Concise code means less unnecessary logic, not compressed vertical spacing.
- Use one blank line between logical steps, even within the same phase. Input preparation, validation, query construction, mutation, side effects, and returning a result should read as separate paragraphs, not one uninterrupted block.
- Separate multiline declarations from the next statement. Short declarations may stay grouped only when they prepare the same immediate operation; sharing a scope or using the same variable is not enough reason to group statements.
- Put a blank line before and after standalone loops and iteration calls such as `forEach`, separating setup, iteration, and subsequent work. Apply these rules inside callbacks and nested branches too.
- Separate a condition's setup from its `if`, a guard from subsequent work, and independent conditionals from each other. Separate calculations from assignments or calls that mutate state, and separate base query construction from optional query modifications.
- Put a blank line before a final return when other statements precede it, including in short helpers.
- Separate top-level functions, classes, and type/interface declarations with one blank line; keep related imports grouped.
- In tests, separate setup, execution, and assertions with blank lines, not explanatory comments.
- Use single blank lines, never consecutive blank lines. Do not insert them immediately inside blocks, between every object property, or between every line of one expression. These limits are not a reason to collapse separate steps.
- Before handing off, review edited code specifically for missing blank lines, not just formatter compliance. Prettier preserves logical blank lines but does not invent missing ones. Do not copy dense surrounding code or remove useful spacing to shorten a diff.

For example, query preparation and mutation need breaks even inside one callback:

```ts
const manyTables = new Set(
  joins.filter((join) => join.isOneToMany).map((join) => getTableName(join.table)),
);

const groups: SQL[] = [sql`${table.id}`];
const selections: Record<string, SQL | SQL.Aliased> = { id: sql`${table.id}`.as('id') };

orderBy.forEach(({ column, order }, index) => {
  const many = manyTables.has(getTableName(column.table));

  if (!many) groups.push(sql`${column}`);

  const value = many ? (order === asc ? min(column) : max(column)) : column;

  selections[`order_${index}`] = sql`${value}`.as(`order_${index}`);
});

const joined = getJoinedJobQuery({ query, dialect, selections, groups });
```

## Naming patterns

- **Type naming**: Prefix with context (e.g., `ArtifactCreateProps`, `ArtifactDBUpdateProps`)
- **Function naming**: Match types to functions (`dbCreate` → `ArtifactDBCreateProps`)
- **Shorter names**: `createTextDoc` vs `saveTextDocumentToDatabase`
- **Keep it simple**: Handle the cases the feature needs; do not add unused options or abstractions
- **Component wrappers**: Name a private component that continues past a provider or readiness guard `*Inner` (for example, `ChatInner`)

## FrogBot Type Naming (`packages/frogbot`)

- **Only use `Frogbot*` prefix when wrapping a Payload type that uses `Payload*` prefix** (e.g., `FrogbotConfig` wraps `PayloadConfig`, `FrogbotRequest` wraps `PayloadRequest`)
- **New domain types should NOT get the `Frogbot` prefix** — the package context is sufficient (e.g., `CollectionConfig`, `Field`, `Endpoint`, `Plugin`)
- **If there's a name collision** with a Payload type, import the Payload type with a `Payload*` alias rather than prefixing our type
- Current valid prefixed types: `FrogbotConfig`, `FrogbotRequest`, `FrogbotComponent`, `FrogbotInstance`, `FrogbotTypes`, `UntypedFrogbotTypes`

## Type Generation (`packages/frogbot`)

- FrogBot is the **sole** type generator (`frogbot generate:types` → `frogbot-types.ts`). It already includes Payload's shapes via `configToJSONSchema` — there is no separate "Payload types" output.
- Payload's own boot-time auto-generate (`typescript.autoGenerate`, spawns a child process, writes `payload-types.ts`) must always be force-disabled on the Payload config built in `config/sanitize.ts`. Never fix this by telling users to set `typescript: { autoGenerate: false }` in their `frogbot.config.ts`.
- The user-facing `typescript.autoGenerate` in `frogbot.config.ts` controls **FrogBot's** generation only (`FrogbotSanitizedConfig.typescript.autoGenerate`), wired to a boot-time call in `Frogbot.init()`.
- Known related bugs: Payload's auto-generate breaks under Turbopack (vercel/next.js#66723) and trips a tsx/Node `module.registerHooks` bug on Node ≥23.5 (payloadcms/payload#16949, fixed in Payload's own `bin.js`). `config/load.ts` applies the same `registerHooks` guard before calling `tsImport`.

## UI Parity with Firmware (CRITICAL — do not deviate)

- **Firmware (`~/code/firmware`) is the previous iteration of FrogBot.** The goal is to port Firmware's existing, already-designed UI into FrogBot as FrogBot features — NOT to design new UI from scratch.
- **When building any FrogBot admin/UI surface, find the corresponding Firmware implementation first** (`apps/web`, `apps/desktop`, `packages/app`, `packages/ui`, admin panel customizations) and follow it exactly. Not everything ports over, but where a Firmware design exists, it is the spec.
- **Concrete example (issue #35):** the api-keys plugin UI must be a single button injected into the Payload collection list view that opens a modal (create → one-time key reveal in the same modal) — exactly how Firmware did it (`apps/web/src/collections/ApiKeys/components/CreateApiKeyButton.tsx`). Inline always-visible panels above the list table are wrong.
- **Direction of travel:** FrogBot's default Payload admin panel is progressively moving toward the Firmware desktop app / aggressively-masked web admin look, with FrogBot providing the components. Don't go fully there in one step, but new UI work must trend toward that design, never away from it.

### UI color tokens

- Use `--theme-base-*` for neutral component colors that should invert between light and dark themes.
- Use `--color-base-*` only for fixed palette colors that must not invert, such as dark scrims or fixed-contrast text on brand/status surfaces.
- Use `--theme-elevation-*` only in admin-only styles where the admin runtime supplies those tokens; reusable `packages/ui` styles must use `--theme-base-*`.

### Payload UI import identity

- In one client component graph, never mix runtime imports from `@payloadcms/ui` with `@payloadcms/ui/elements/*` or `@payloadcms/ui/icons/*`. The root entry is bundled and creates different React context identities from public subpaths, causing hooks such as `useConfig()` to return `undefined` at runtime.
- Prefer root-only runtime imports and canonical root components. Utility subpaths and type-only imports are safe. If a required component is not exported from the root, redesign around a canonical root component rather than mixing entries.
- Typechecking cannot detect this failure. Smoke-test the affected admin interaction in the simple example after rebuilding packages.

## Constraints

- **CRITICAL — documentation branding:** Never refer to Payload or Payload CMS in user-facing documentation, templates, examples, READMEs, scaffolded comments, or other user-visible copy. FrogBot is the product users interact with: describe behavior, APIs, admin features, adapters, collections, migrations, sessions, and configuration as **FrogBot** behavior. Rewrite underlying-framework references as a FrogBot self-reference or neutral wording. Before finishing documentation work, run the case-sensitive whole-word check: `rg -n -w -F 'Payload' -g '*.mdx' .` and remove every match unless the user explicitly requires a literal upstream package name or attribution.
- **Don't add comments unless explicitly requested.** Zero comments is the default, even for "explaining why this weird workaround exists." No comment blocks, no citations, no rationale — write it in the chat response instead, not the code. This has been a repeat mistake — check every edit before writing it.
- Don't assume libraries are available - check first
- Don't over-engineer solutions
- Don't keep buggy legacy code "just in case"

## Verification

- Put new tests, fixtures, test helpers, and test-only apps under the repository's root `test/` folder. Do not place unit tests beside production code or inside package `src/` folders. Follow the existing test layout and runner configuration; moving existing tests is separate work.
- Tests and fixtures are part of implementation; they do not need a separate request. Once the feature's parts work together, check that it meets the agreed requirements, handles realistic failures, and has not broken related behavior. Planned tickets include a testing stage for this work; small direct edits need only the relevant checks.
- Use unit tests for individual logic, integration tests for parts working together, and end-to-end (E2E) tests for affected user, API, or CLI flows. Inspect the test runner and existing fixtures. Test the result, not just whether an internal function was called. Do not replace the component whose behavior you are testing with a mock: for example, a database-claim test must exercise the real claim operation.
- While a feature is incomplete, run checks that can give meaningful results. Record what is not connected yet and which later stage will test it. Do not run full suites against intentionally unfinished work, but investigate unexpected failures.
- For bug fixes, show that the test fails for the original bug when feasible; say when you could not check that. Write assertions for the correct behavior, and correct existing tests that expected the bug.
- Make tests repeatable. Use controlled test data and services where appropriate. Wait for a specific event or condition with a timeout, rather than pausing for an arbitrary duration and hoping the operation finished. When testing time itself, use a controllable clock where the test setup supports it. State when a test requires a paid or live service.
- Find commands and environment requirements in [package.json](package.json), [vitest.config.ts](vitest.config.ts), and the [browser configuration](test/browser/playwright.config.ts). `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, and `pnpm test:browser` select different suites; E2E and browser tests are not interchangeable. Gateway projects have their own test-selection settings. Rebuild packages before tests that load their built output.
- For code changes, run relevant tests followed by `pnpm prettier:write && pnpm lint:fix`. Agents must delegate lint and required type-checking to the `lint` subagent, including `pnpm lint:fix`. Do not repeat repository-wide checks after every stage.
- For Markdown-only changes, check affected-file formatting, links/anchors, examples, and content/instruction consistency; do not run application tests, code lint, or typecheck. Documentation containing executable code changes may need targeted example validation.
- Review automatic fixes and preserve unrelated work. Rerun affected tests if fixes change behavior. Report commands actually run, results, skips, and unavailable services/credentials; required blocked checks leave the ticket unverified.

### When tests find a problem

A failing test shows behavior we need to understand; it does not, by itself, decide what the feature must promise. Compare the finding with the agreed requirements and existing supported behavior:

- **Fix now:** the implementation breaks a requirement or existing supported behavior. Fix it and rerun the affected checks. A rare failure still matters if it breaks something we promised.
- **Document:** the behavior is an agreed limitation, not a broken promise. Explain what users need to know and how to handle it.
- **Defer:** addressing it would add behavior or guarantees outside the agreed work. Report the finding and ask the owner before adding it to the feature or accepting a new limitation.

Raise security or data-loss findings promptly, even if the requirements did not mention them. Do not dismiss them as out of scope. If a fix needs a dependency patch, a different core library, or a substantial design change, pause that work and ask the owner first. Explain what can happen to a user, how it can happen, what is known about its likelihood, and the simpler alternatives. A newly discovered problem is not permission to redesign the feature.

Do not weaken tests or mark failures as expected just to get a passing suite. If the owner changes a requirement or accepts a limitation, update the requirements and tests to match that decision, and keep the limitation visible in the final summary. Record findings in the existing summary; a separate report for every test failure is not required.

## File Organization

- **Internal structure is for contributors, exports are for consumers** — define types/code wherever makes sense for devs working inside the package. Control public API surface separately via the exports layer. Don't conflate "where to define" with "what to export".

### FrogBot Core Project Structure

`packages/frogbot/src` follows Payload core's file and folder structure where FrogBot implements an equivalent concept.

1. Check Payload core for an equivalent domain; if one exists, use that name and nesting.
2. Co-locate types with the domain that owns them; never add domain types to a horizontal catch-all.
3. Keep a FrogBot-specific top-level domain only when Payload has no equivalent.
4. Do not create a Payload domain FrogBot does not implement.
5. Keep the public boundary in `src/index.ts` and `src/exports/` regardless of internal layout.

Representative mappings include collection configuration in `collections/config/`, file handling in `uploads/`, import-map generation in `bin/generateImportMap/`, field types in `fields/config/`, and operation types split across `auth/`, `collections/`, and `versions/`. FrogBot-specific domains such as `agents/`, `ai/`, `chat/`, `connections/`, `pieces/`, `skills/`, and `tools/` remain top-level and own their types.

## Reference Repos

Use applicable local implementations, types, tests, and fixtures rather than memory or web copies of available code. The [Step 0 routing table](.github/feature-process/step0_research.md#local-source-routing) also covers gateway/client comparisons and unavailable sources; references below are local checkout defaults, not dependencies every contributor must clone.

- **Payload source:** `~/code/payload` — ALWAYS check this repo for Payload internals, types, test patterns, and API surface before assuming something doesn't exist or guessing behavior. This is the actual source of truth for what Payload supports.

- **AI SDK by Vercel source:** `~/code/ai` — ALWAYS check this repo for AI SDK by Vercel internals, types, test patterns, and API surface before assuming something doesn't exist or guessing behavior. This is the actual source of truth for what AI SDK by Vercel supports.

- **`opencode` source:** `~/code/opencode` — ALWAYS check this repo for `opencode` internals, types, test patterns, and API surface before assuming something doesn't exist or guessing behavior. This is the actual source of truth for what `opencode` supports.

- **`opencode` v2 beta source:** `~/code/opencode-v2` — the 2.0 beta line (git worktree on `v2-beta`, tracks `origin/beta`). Check for 2.0 architecture direction (Effect runtime, `core`/`protocol`/`server`/`llm`/`sdk-next` package split). NOT shipped behavior — for what `opencode` does today, use `~/code/opencode`.

- **Strapi source:** `~/code/strapi` — use for ideas and comparative patterns in headless CMS architecture, extensibility, administration, and developer experience. It is not a source of truth for FrogBot behavior.

- **Directus source:** `~/code/directus` — use for ideas and comparative patterns in data-platform architecture, administration, integrations, and developer experience. It is not a source of truth for FrogBot behavior.
