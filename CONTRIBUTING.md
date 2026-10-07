# Contributing to FrogBot

FrogBot is a pnpm monorepo that wraps Payload 3 with an AI-native layer (agents, tools, chat, pieces, connections, jobs, a gateway) and ships it under FrogBot names. This guide is for everyone who changes it. Agents also follow [CLAUDE.md](CLAUDE.md); work in `packages/ui` also follows [UI conventions](packages/ui/CONTRIBUTING.md).

## Setup

- Use the `pnpm` version and Node range in [package.json](package.json), and run every command from the repo root.
- `pnpm install` installs dependencies and the [git hooks](#commits). A new worktree runs its hooks only after its own `pnpm install`.
- `pnpm build` builds every package. It skips packages whose sources, config, lockfile and dependency types are unchanged; `pnpm -r clean` forces a full rebuild when you suspect a stale build.
- Examples run against the local packages with `pnpm --filter <example-name> dev`.
- Docker services are needed only for database integration and storage adapter tests. First browser run: `pnpm exec playwright install chromium firefox webkit`.

## Repository map

| Path                                                                           | Contents                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/frogbot`                                                             | Core: `buildConfig`, the `FrogBot` class, `getFrogBot`, the CLI (`bin/`), typegen and every domain. The public boundary is `src/index.ts` plus `src/exports/*` (`frogbot/agents`, `frogbot/tools`, ...). |
| `packages/next`, `packages/ui`                                                 | Next.js integration (`withFrogBot`, admin routes, import map) and the UI and chat component library.                                                                                                     |
| `packages/db-*`, `packages/storage-*`, `packages/email-*`, `packages/kv-redis` | Thin wrappers over the Payload adapters, published as `@frogbotai/*`.                                                                                                                                    |
| `packages/plugins/plugin-*`                                                    | First-party plugins (api-keys, roles, mcp, audit-log, stripe, ...).                                                                                                                                      |
| `packages/pieces/piece-*`                                                      | Integration pieces (actions, triggers, OAuth recipes); [`packages/pieces/PORTING.md`](packages/pieces/PORTING.md) is the porting kit.                                                                    |
| `packages/gateway`, `packages/sdk`                                             | The embeddable AI gateway and the client SDK.                                                                                                                                                            |
| `packages/create-frogbot-app`                                                  | The scaffolder; packs `templates/` into its `dist/` at build time.                                                                                                                                       |
| `templates/`, `examples/`                                                      | Starters the CLI installs (`blank`), and reference apps that are not installable.                                                                                                                        |
| `docs/`                                                                        | The Mintlify site (`docs.json`).                                                                                                                                                                         |
| `test/`                                                                        | Every test and fixture, one folder per area, plus `test/unit/`, `test/e2e/`, `test/browser/` and the shared harness in `test/__helpers/`. See [test/README.md](test/README.md).                          |
| `scripts/`                                                                     | Repo tooling: `check.mjs` runs every `check-*.mjs`, `ticket.mjs` is `pnpm ticket`, `prerelease.mjs` is the `pnpm bump` release gate.                                                                     |
| `.github/feature-process/`                                                     | How tickets go from issue to commit. `.idea/` holds local ticket documents and is never committed.                                                                                                       |

Before reading code:

- `packages/frogbot/src/config/sanitize.ts` turns a `FrogBotConfig` into a Payload config. FrogBot-only keys (`agents`, `ai`, `connections`, `tools`, ...) are consumed there and never reach Payload. `rewriteComponentPaths.ts` renames `@payloadcms/*` component paths to `@frogbotai/*` in the generated import map.
- `FrogBotRequest` replaces `req.payload` with `req.frogbot`; user code never sees `payload`.
- The internal layout mirrors Payload core where a concept matches (see [Project structure](#project-structure)).

## Design principles

FrogBot is in beta. The goal is the best, most consistent developer experience across all of FrogBot, not the smallest diff. These principles decide between designs that all work.

- **Payload first, with restraint.** FrogBot users build on Payload's model, so a familiar shape beats a clever one. Before designing an API, lifecycle or runtime flow, find Payload's closest equivalent in [`~/code/payload`](#reference-repos) and follow it unless there is a concrete reason not to; record the reason in the plan. Match Payload; don't exceed it. Agent-harness work (chat turns, agents, tools, sessions, streaming and their SQLite storage) follows OpenCode v2 in `~/code/opencode-v2` the same way. Examples: definitions are config; a hook returns the value core saves (`beforeChange`) instead of keeping its own state; side effects run in `afterChange` on the document that owns the data, so every write path triggers them; a job saves each task's output so a retry skips finished work.
- **No legacy.** No shims, flags, fallbacks, parallel old and new paths, data migrations, migration guides or upgrade notes. Each one is a second way to do the same thing, and the inconsistency outlives the beta. Delete dead code and buggy compatibility paths instead of keeping them "just in case". Don't ask whether to keep the old behavior.
- **Breaking changes are fine.** When a better API, schema or extension point needs one, make it and update every caller, piece, plugin, test and doc in the same commit. Mark it with `!` in the subject and a `BREAKING CHANGE:` footer.
- **One pattern per concept.** Extension points that do the same kind of job (piece hooks, plugin options, adapters, channel renderers) share naming, argument shapes, return shapes and lifecycle. When one integration needs a seam core lacks, change the core seam for every implementation instead of working around it in one package.
- **Generic where the variation is real.** Put shared behavior in core behind a typed, documented extension point once two implementations need it, and keep platform specifics in their own package. Handle the cases the feature needs: no unused options, abstractions or extension points for needs nobody has yet. Check that a library is installed before using it.

## Commands

| Task                                | Command                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build every package                 | `pnpm build`                                                                                                                                                                        |
| Static checks                       | `pnpm check` (format, lint, stale-package build, fixture import maps, changed-workspace typecheck, every `scripts/check-*.mjs`; never tests or servers); `--full` checks everything |
| One check                           | `pnpm check <name>`, where name is a `scripts/check-<name>.mjs` file (see [Checks](#checks))                                                                                        |
| Format and lint                     | `pnpm prettier`, `pnpm lint` (report only); `pnpm prettier:write`, `pnpm lint:fix`; after fixing a baselined violation, `pnpm lint --prune-suppressions`                            |
| Typecheck                           | `pnpm --filter <workspace> typecheck` (`frogbot` also takes area names: `pnpm --filter frogbot typecheck jobs`); `pnpm typecheck` builds and checks every workspace                 |
| Tests                               | `pnpm test` (every project), `pnpm test:unit`, `pnpm test:ui`, `pnpm test:int`, `pnpm test:gateway`, `pnpm test:e2e`, `pnpm test:browser --project <name>`; pass files to narrow    |
| Integration tests on one database   | `pnpm test:int:sqlite`, `pnpm test:int:pg`, `pnpm test:int:mongo` (`pnpm test:int:pg test/database`)                                                                                |
| Docker services                     | `pnpm docker:start` (Postgres, Redis, MongoDB, MongoDB search, storage emulators), `pnpm docker:clean` (removes containers and volumes)                                             |
| Live tests with real credentials    | `pnpm test:live` (see [Live tests](test/README.md#live-tests-real-credentials))                                                                                                     |
| Regenerate a test suite's types     | `pnpm generate:types <suite>` (needs built packages)                                                                                                                                |
| Sync the AI model catalog and types | `pnpm sync:catalog`                                                                                                                                                                 |
| Tickets                             | `pnpm ticket next`, `new <n>`, `status [--batch <n>]`, `decisions`, `found "<row>"`, `stats`, `land <n>` (see [the feature process](.github/feature-process/README.md))             |
| Release                             | `pnpm bump <major\|minor\|patch>` (`--from <step>` resumes), `pnpm release` (owner only; `--resume` after a partial publish), `pnpm release:status`                                 |

`prepare` and `lint-staged` are git-hook plumbing and have no row. Packages have only `build`, `clean` and `typecheck`.

### Checks

`pnpm check` runs these; each also runs alone as `pnpm check <name>`.

| Name              | Fails when                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `branding`        | templates, examples, docs, skills or READMEs mention Payload                                                                                 |
| `docs-fences`     | a docs code block has no language, or marks a shell command as plain text                                                                    |
| `docs-links`      | a General docs link, anchor or local asset is broken                                                                                         |
| `docs-references` | a docs or skill example imports a name `frogbot` or `@frogbotai/*` does not export (its allowlist holds intentional placeholders only)       |
| `option-tables`   | a docs option table does not list exactly its type's properties, or a `\| Option \|` table is missing from `docs/option-tables.json`         |
| `tests`           | a spec sits in `packages/**/src` or in no project, an int suite skips `clearAndSeed`, or scratch files go outside `os.tmpdir()`/`test/.tmp/` |
| `packages`        | a workspace folder has no tracked `package.json`                                                                                             |
| `scripts`         | a root script has no row in the command table above (or the reverse), or a package has scripts beyond the three                              |
| `ui-architecture` | `packages/ui` uses forbidden imports, globals or strings                                                                                     |
| `generated`       | a tracked `importMap.js`, `frogbot-types.ts` or `piece-types.ts` is stale (`--full` only; `--write` rewrites them)                           |
| `test-types`      | `test/` has a type error beyond `test/typecheck-baseline.json`, or fewer than it lists (`--full` only; `--write` lowers it)                  |
| `dist-imports`    | a built relative import or entry point does not match a file name exactly, including case                                                    |
| `single-frogbot`  | a package lists `frogbot` as a regular dependency, or `frogbot` has framework peers                                                          |
| `peer-variants`   | a dependency of several workspace folders installs as two peer variants of one version in `pnpm-lock.yaml`                                   |
| `ticket-docs`     | a ticket folder disagrees with the templates, `.idea/decisions.md` or the plan (main checkout only)                                          |

## Code style

- Crisp, simple code. Prefer object parameters over several positional ones.
- Don't add comments unless asked: no comment blocks, citations or rationale. Put the explanation in the commit or the conversation.
- Name consistently and briefly: `createTextDoc`/`updateTextDoc`, not `saveTextDocumentToDatabase`. Prefix types with their context (`ArtifactCreateProps`) and match them to their function (`dbCreate` → `ArtifactDBCreateProps`).
- Name a private component that continues past a provider or readiness guard `*Inner` (`ChatInner`).
- Brand casing: `frogbot` when the brand leads a camelCase identifier, `FrogBot` everywhere else in identifiers and file names (`frogbotFavicon`, `FrogBotConfig`, `getFrogBot`, `bootFrogBot.ts`); never `frogBot` or `Frogbot`. Package names, paths, CLI commands, slugs, environment variables and wire values stay lowercase (`FROGBOT_*` for constants).
- Use the `FrogBot*` prefix only for a type that wraps a `Payload*` type (`FrogBotConfig` wraps `PayloadConfig`). New domain types get no prefix (`CollectionConfig`, `Field`); on a name clash, import the Payload type under a `Payload*` alias.

### Blank lines

Favor breathing room over fewer lines; when a blank line is debatable, add it. Concise code means less logic, not compressed spacing. Prettier keeps blank lines but never adds them, so review edited code for missing ones.

- One blank line between logical steps, even within one phase: preparing input, validating, building a query, mutating, side effects and returning read as separate paragraphs.
- Separate a multiline declaration from the next statement. Short declarations stay grouped only when they prepare the same operation.
- Put a blank line before and after loops and iteration calls such as `forEach`, inside callbacks and nested branches too.
- Separate a condition's setup from its `if`, a guard from the work after it, and independent conditionals from each other. Separate calculations from mutations, and a base query from its optional modifiers.
- Put a blank line before a final `return` that follows other statements, and between top-level functions, classes and types.
- In tests, separate setup, execution and assertions with blank lines, not comments.
- Never two blank lines in a row, and none directly inside a block, between every object property or inside one expression.

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

## Domain rules

- **Type generation.** FrogBot is the only type generator (`frogbot generate:types` → `frogbot-types.ts`), and its output already includes Payload's shapes. Payload's boot-time `typescript.autoGenerate` is always force-disabled in `config/sanitize.ts`; never ask users to turn it off. The user-facing `typescript.autoGenerate` controls FrogBot's generation in `FrogBot.init()`.
- **Keep `req.frogbot` structural.** `FrogBot` and every class reachable from its public API (`Connections`, `ConnectionStore`, `TriggerSubscriptions`, piece instances) have no `private`, `protected`, `#private` or symbol-keyed members, or two installed copies of `frogbot` stop being compatible. Keep internal state in a module-level `WeakMap`; `pnpm --filter frogbot typecheck duplicate` enforces this.
- **User-facing copy says FrogBot.** Docs, templates, examples, READMEs and scaffolded files describe everything as FrogBot behavior (`pnpm check branding`). A config object, option set or props type documented in `docs/` gets one table of every field its type accepts, on one page that others link to (`pnpm check option-tables`).

### UI

- **Firmware is the spec.** Firmware (`~/code/firmware`) is FrogBot's previous iteration. Before building an admin or UI surface, find its Firmware implementation (`apps/web`, `apps/desktop`, `packages/app`, `packages/ui`) and follow it; port, don't redesign. For example, the api-keys UI is one button in the collection list view that opens a modal (create, then a one-time key reveal), as in `apps/web/src/collections/ApiKeys/components/CreateApiKeyButton.tsx`. New UI work trends toward the Firmware desktop look, never away.
- **Color tokens.** `--theme-base-*` for neutral colors that invert between themes; `--color-base-*` only for fixed colors that must not invert (dark scrims, text on brand surfaces); `--theme-elevation-*` only in admin-only styles, never in `packages/ui`.

## Verification

- Tests and fixtures are part of the work and need no separate request. Use unit tests for single pieces of logic, integration tests for parts working together, and end-to-end tests for affected user, API or CLI flows. Test the result, not whether an internal function was called.
- Integration suites boot a real instance with `bootFrogBot` from `test/__helpers/shared` and shut it down in `afterAll`. Delete anything created outside the seed in `afterEach`.
- Keep collection slugs and shared identifiers in the suite's `config.ts` or a constants file and reuse them. A new collection goes in that `config.ts`; run `pnpm generate:types <suite>` when its shape matters.
- For a bug fix, show the test fails on the original bug when you can, and say when you couldn't. Fix existing tests that expected the bug.
- While a feature is unfinished, run the checks that can say something useful and record what isn't connected yet. Investigate unexpected failures.
- Run the narrowest tests that cover the change, in the foreground with a timeout. Rebuild packages before tests that load built output. E2E and browser tests are different suites. Start Docker services only for suites that need them. State when a test needs a paid or live service.
- Browser runs: one Playwright process per checkout (two overwrite `test/browser/test-results`); other worktrees use their own ports. Run affected specs with `--project <name>`, so only that fixture builds, and the full suite at most once, at the end. After a failure, read the first error, then rerun with `--last-failed`. A failed `<server>-setup` project means that server is broken: fix it. See [Browser tests](test/README.md#browser-tests).
- Finish code changes with `pnpm check`. Typecheck affected workspaces while working; run the root `pnpm typecheck` at most once, at the end, when the change needs it.
- Markdown-only changes need formatting, links, anchors and accurate examples, not application tests, lint or typecheck. Docs with executable code may need the example run.
- Report the commands you ran, their results, and anything skipped or unavailable. A required check that couldn't run leaves the work unverified.

### When tests find a problem

A failing test shows behavior to understand; it doesn't by itself decide what the feature promises. Compare it with the agreed requirements and existing supported behavior:

- **Fix now** when it breaks a requirement or supported behavior, however rare. Rerun the affected checks.
- **Document** an agreed limitation: what users need to know and how to handle it.
- **Defer** anything that adds behavior or guarantees beyond the agreed work: add a row to `.idea/found.md` with `pnpm ticket found` and carry on.

Raise security and data-loss findings right away, even when the fix is out of scope: what can happen to a user, how, how likely, and the simpler alternatives. A fix that needs a different core library or a substantial redesign waits for the owner; a new problem is not permission to redesign. Never patch a dependency or work around one with architecture; record the limitation and continue.

Don't weaken tests or mark failures expected to get a green suite. When the owner changes a requirement or accepts a limitation, update the requirements and tests and keep the limitation visible in the summary.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): message`, with type `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `build`, `ci` or `style` and the package or area as scope (`feat(gateway): add retry-after header support`). Breaking changes add `!` and a `BREAKING CHANGE:` footer.
- One verified ticket is one commit, focused on its change.
- The hooks enforce the rest. [`.husky/pre-commit`](.husky/pre-commit) runs lint-staged (`eslint --fix` and `prettier --write`; any lint error, warning or unused `eslint-disable` fails), then [`scripts/precommit-guard.mjs`](scripts/precommit-guard.mjs) refuses `.idea/`, `CHANGELOG*`, `.changeset/`, `patches/` and new `patchedDependencies`. Older lint violations are baselined in `eslint-suppressions.json`, which only shrinks. [`.husky/commit-msg`](.husky/commit-msg) runs [`scripts/commit-msg.mjs`](scripts/commit-msg.mjs), which checks the subject and refuses `Co-authored-by:` and "Generated with" lines.

## Project structure

Internal structure is for contributors; exports are for consumers. Define code where it makes sense inside the package and control the public API separately in `src/index.ts` and `src/exports/`.

`packages/frogbot/src` follows Payload core's folders where FrogBot implements the same concept:

1. Check Payload core for an equivalent domain; if one exists, use its name and nesting.
2. Keep types with the domain that owns them, never in a catch-all.
3. Add a FrogBot-only top-level domain only when Payload has no equivalent, and never a Payload domain FrogBot doesn't implement.

For example: collection config in `collections/config/`, files in `uploads/`, import-map generation in `bin/generateImportMap/`, field types in `fields/config/`, operation types across `auth/`, `collections/` and `versions/`. FrogBot-only domains (`agents/`, `ai/`, `chat/`, `connections/`, `pieces/`, `skills/`, `tools/`) stay top-level and own their types.

## Reference repos

Check local source, types and tests instead of memory or web copies. These are local checkouts, not dependencies; [Step 1](.github/feature-process/step1_research.md#reference-repos) lists more.

| Checkout                           | Use                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/payload`                   | Payload source: the truth for its internals, types, tests and API.                                                                                              |
| `~/code/ai`                        | AI SDK by Vercel source: the truth for what it supports.                                                                                                        |
| `~/code/opencode`                  | `opencode` 1.x (`dev` branch).                                                                                                                                  |
| `~/code/opencode-v2`               | `opencode` 2.x (`v2` worktree; Effect-based `core`, `protocol`, `server`, `ai`, `sdk`, `cli`). Use the line that matches the version in question and say which. |
| `~/code/firmware`                  | FrogBot's previous iteration: the UI spec.                                                                                                                      |
| `~/code/strapi`, `~/code/directus` | Ideas for CMS and data-platform design; never the truth for FrogBot behavior.                                                                                   |
