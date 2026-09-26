# Changelog

## Unreleased

### Breaking changes

- Replaced the non-invocable Bedrock IDs `amazon.nova-2-lite-v1:0`, `meta.llama3-1-8b-instruct-v1:0`, and `meta.llama3-3-70b-instruct-v1:0` with `global.amazon.nova-2-lite-v1:0`, `us.meta.llama3-1-8b-instruct-v1:0`, and `us.meta.llama3-3-70b-instruct-v1:0`, respectively.
- The admin nav shell no longer carries Payload's `nav` / `nav--nav-open` classes. Its layout is driven by `data-nav-state` on `.frogbot-nav-shell` (`desktop-nav-open`, `desktop-nav-closed`, `mobile-nav-open`, `mobile-nav-closed`) and the `--frogbot-nav-width` custom property. Custom CSS targeting `.nav--nav-open` inside the FrogBot shell must switch to the state attribute.

### Features

- `@frogbotai/db-sqlite` implements collection search: FTS5 lexical search, LibSQL vector search on a DiskANN index or exact, and hybrid reciprocal rank fusion, each in one SQL statement. Search tables, indexes, and triggers are part of development push and generated migrations.
- `@frogbotai/db-mongodb` implements collection search on deployments with MongoDB Search (Atlas or `mongot`): `$search` lexical search, `$vectorSearch` approximate or exact vector search, and hybrid reciprocal rank fusion with `$rankFusion`, or `$unionWith` on servers without it. The adapter creates and updates the collection's search indexes when it connects.
- `@frogbotai/db-d1-sqlite` implements lexical collection search with FTS5 tables and triggers that are part of development push and generated migrations. Cloudflare D1 has no native vector search, so an index with `vector` fails setup with `SearchCapabilityError` and reason `engine-gap`; vector fields still store values. Generated D1 migrations now import `MigrateUpArgs`, `MigrateDownArgs`, and `sql` from `@frogbotai/db-d1-sqlite`.
- Search indexes accept `vector.approximate` (default `true`) to choose between an approximate nearest-neighbour index and exact vector search, and an index-level `defaultCandidates` that replaces `hybrid.defaultCandidates`. The query's `candidates` now also applies to approximate vector search: Postgres uses it as `hnsw.ef_search` and SQLite as the `vector_top_k` neighbour count.

### Fixes

- The collapsed desktop sidebar rail was invisible: without Payload's `nav--nav-open` class the shell inherited `.nav { opacity: 0 }`.
- On viewports under 768px the main content collapsed to 0px wide because the hidden/overlaid sidebar left Payload's two-column grid in place. The template is now single-column while the drawer is closed or open.
- The mobile drawer gains a backdrop and closes on backdrop tap, Escape, and navigation.

### Tooling

- Added a Playwright suite (`pnpm test:browser`) that boots `templates/blank` and asserts the nav shell's layout in all four states. Run `pnpm test:browser:install` once to fetch Chromium.
