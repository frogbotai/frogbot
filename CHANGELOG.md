# Changelog

## Unreleased

### Breaking changes

- `ModelSelector` from `@frogbotai/ui/chat` requires `selectedModelId` and `onReasoningChange`, and `onModelChange` always receives a model ID; the "Default" model item is gone.
- The model catalog is refreshed from models.dev (350 → 454 models). These IDs are no longer in the catalog or the generated model ID types: `cerebras/gemma-4-31b`, `cerebras/zai-glm-4.7`, `deepinfra/MiniMaxAI/MiniMax-M2.7`, `deepinfra/moonshotai/Kimi-K2.5`, `deepinfra/zai-org/GLM-4.7-Flash`, `deepinfra/zai-org/GLM-5`, `fireworks/accounts/fireworks/models/deepseek-v4-flash`, `fireworks/accounts/fireworks/models/deepseek-v4-pro`, `fireworks/accounts/fireworks/models/glm-5p2`, `fireworks/accounts/fireworks/models/gpt-oss-20b`, `fireworks/accounts/fireworks/models/kimi-k2p6`, `fireworks/accounts/fireworks/models/kimi-k2p7-code`, `fireworks/accounts/fireworks/models/minimax-m2p7`, `fireworks/accounts/fireworks/routers/kimi-k2p6-fast`, `fireworks/accounts/fireworks/routers/kimi-k2p6-turbo`, `fireworks/accounts/fireworks/routers/kimi-k2p7-code-fast`, `google/gemini-robotics-er-1.6-preview`, `groq/meta-llama/llama-4-scout-17b-16e-instruct`, `groq/qwen/qwen3-32b`, `openai/gpt-5.2-chat-latest`, and `openai/gpt-5.3-chat-latest`. Prices, limits, and names of other models are updated.
- Replaced the non-invocable Bedrock IDs `amazon.nova-2-lite-v1:0`, `meta.llama3-1-8b-instruct-v1:0`, and `meta.llama3-3-70b-instruct-v1:0` with `global.amazon.nova-2-lite-v1:0`, `us.meta.llama3-1-8b-instruct-v1:0`, and `us.meta.llama3-3-70b-instruct-v1:0`, respectively.
- The admin nav shell no longer carries Payload's `nav` / `nav--nav-open` classes. Its layout is driven by `data-nav-state` on `.frogbot-nav-shell` (`desktop-nav-open`, `desktop-nav-closed`, `mobile-nav-open`, `mobile-nav-closed`) and the `--frogbot-nav-width` custom property. Custom CSS targeting `.nav--nav-open` inside the FrogBot shell must switch to the state attribute.

### Features

- The admin chat has a compact model and reasoning selector: a text trigger such as `Claude Opus 4.7 · High` opens a slider of the model's own levels, with the model list one step away. Each model remembers its last level, and an existing chat opens at its latest message's choice.
- `POST /api/agents/:slug` accepts `reasoning` next to `model`, and the agent manifest lists each allowed model's levels. An unavailable level returns 400. Custom providers declare levels with `reasoningOptions` on their models.
- Each user message stores the model and reasoning level it was sent with, and every turn it drives uses them, including queued messages, messages sent mid-turn (from the next step), and continuations. A stored choice that is no longer valid fails the turn with `selection-unavailable` instead of switching models.
- `@frogbotai/gateway` exports `resolveReasoningVariants`, which lists the reasoning levels a model can actually send (for example `Low`, `High`, `Max`, `Off`, or budget presets such as `High · 16k`) with the provider options for each. Catalog entries gain `capabilities.reasoningOptions`, and `canonicalizeModelId` is exported.
- `@frogbotai/db-sqlite` implements collection search: FTS5 lexical search, LibSQL vector search on a DiskANN index or exact, and hybrid reciprocal rank fusion, each in one SQL statement. Search tables, indexes, and triggers are part of development push and generated migrations.
- `@frogbotai/db-mongodb` implements collection search on deployments with MongoDB Search (Atlas or `mongot`): `$search` lexical search, `$vectorSearch` approximate or exact vector search, and hybrid reciprocal rank fusion with `$rankFusion`, or `$unionWith` on servers without it. The adapter creates and updates the collection's search indexes when it connects.
- `@frogbotai/db-d1-sqlite` implements lexical collection search with FTS5 tables and triggers that are part of development push and generated migrations. Cloudflare D1 has no native vector search, so an index with `vector` fails setup with `SearchCapabilityError` and reason `engine-gap`; vector fields still store values. Generated D1 migrations now import `MigrateUpArgs`, `MigrateDownArgs`, and `sql` from `@frogbotai/db-d1-sqlite`.
- Search indexes accept `vector.approximate` (default `true`) to choose between an approximate nearest-neighbour index and exact vector search, and an index-level `defaultCandidates` that replaces `hybrid.defaultCandidates`. The query's `candidates` now also applies to approximate vector search: Postgres uses it as `hnsw.ef_search` and SQLite as the `vector_top_k` neighbour count.

### Fixes

- Usage logs record the model that ran each step instead of the agent's default model.
- Queued messages and continuations after a dismissed client tool no longer drop the chosen model.
- The collapsed desktop sidebar rail was invisible: without Payload's `nav--nav-open` class the shell inherited `.nav { opacity: 0 }`.
- On viewports under 768px the main content collapsed to 0px wide because the hidden/overlaid sidebar left Payload's two-column grid in place. The template is now single-column while the drawer is closed or open.
- The mobile drawer gains a backdrop and closes on backdrop tap, Escape, and navigation.

### Tooling

- `pnpm bump` runs `pnpm sync:catalog` first, so each release ships a fresh model catalog.
- AI SDK packages are upgraded to their latest releases within the current major versions (`ai` 7.0.116).
- Added a Playwright suite (`pnpm test:browser`) that boots `templates/blank` and asserts the nav shell's layout in all four states. Run `pnpm test:browser:install` once to fetch Chromium.
