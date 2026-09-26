# Changelog

## Unreleased

### Breaking changes

- `ModelSelector` from `@frogbotai/ui/chat` requires `selectedModelId` and `onReasoningChange`, and `onModelChange` always receives a model ID; the "Default" model item is gone.
- The model catalog is refreshed from models.dev (350 → 454 models). These IDs are no longer in the catalog or the generated model ID types: `cerebras/gemma-4-31b`, `cerebras/zai-glm-4.7`, `deepinfra/MiniMaxAI/MiniMax-M2.7`, `deepinfra/moonshotai/Kimi-K2.5`, `deepinfra/zai-org/GLM-4.7-Flash`, `deepinfra/zai-org/GLM-5`, `fireworks/accounts/fireworks/models/deepseek-v4-flash`, `fireworks/accounts/fireworks/models/deepseek-v4-pro`, `fireworks/accounts/fireworks/models/glm-5p2`, `fireworks/accounts/fireworks/models/gpt-oss-20b`, `fireworks/accounts/fireworks/models/kimi-k2p6`, `fireworks/accounts/fireworks/models/kimi-k2p7-code`, `fireworks/accounts/fireworks/models/minimax-m2p7`, `fireworks/accounts/fireworks/routers/kimi-k2p6-fast`, `fireworks/accounts/fireworks/routers/kimi-k2p6-turbo`, `fireworks/accounts/fireworks/routers/kimi-k2p7-code-fast`, `google/gemini-robotics-er-1.6-preview`, `groq/meta-llama/llama-4-scout-17b-16e-instruct`, `groq/qwen/qwen3-32b`, `openai/gpt-5.2-chat-latest`, and `openai/gpt-5.3-chat-latest`. Prices, limits, and names of other models are updated.
- Replaced the non-invocable Bedrock IDs `amazon.nova-2-lite-v1:0`, `meta.llama3-1-8b-instruct-v1:0`, and `meta.llama3-3-70b-instruct-v1:0` with `global.amazon.nova-2-lite-v1:0`, `us.meta.llama3-1-8b-instruct-v1:0`, and `us.meta.llama3-3-70b-instruct-v1:0`, respectively.
- The admin nav shell no longer carries Payload's `nav` / `nav--nav-open` classes. Its layout is driven by `data-nav-state` on `.frogbot-nav-shell` (`desktop-nav-open`, `desktop-nav-closed`, `mobile-nav-open`, `mobile-nav-closed`) and the `--frogbot-nav-width` custom property. Custom CSS targeting `.nav--nav-open` inside the FrogBot shell must switch to the state attribute.
- Web and HTTP writes to a channel conversation are refused. Sending a message, answering or dismissing a question, or continuing a turn through `/api/agents/<slug>`, `/api/agents/<slug>/chats/<chatId>/settle`, or `generate({ chatId })` fails with `409` and `code: "channel-chat"`, and the message names the channel. The chat's owner can still read it, and the admin chat shows it read-only. `TurnErrorCode` gains `channel-chat`.
- The chat collections' default access changed. Creating a message requires that the request can write the target chat, updating or deleting a message is limited to your own web chats, and a message's `chat` can no longer be changed through the API. Setting `access` on a `chat: true` or `message: true` collection replaces these defaults; compose `canWriteChat` from `frogbot` to keep them.
- The chat fields `channel`, `externalId`, `channelKey`, and `channelThread` are read-only through the API, on create as well as update, and written values are ignored. A `chat: true` collection can no longer define a field named `channelLabel`.

### Features

- The admin chat has a compact model and reasoning selector: a text trigger such as `Claude Opus 4.7 · High` opens a slider of the model's own levels, with the model list one step away. Each model remembers its last level, and an existing chat opens at its latest message's choice.
- `POST /api/agents/:slug` accepts `reasoning` next to `model`, and the agent manifest lists each allowed model's levels. An unavailable level returns 400. Custom providers declare levels with `reasoningOptions` on their models.
- Each user message stores the model and reasoning level it was sent with, and every turn it drives uses them, including queued messages, messages sent mid-turn (from the next step), and continuations. A stored choice that is no longer valid fails the turn with `selection-unavailable` instead of switching models.
- `@frogbotai/gateway` exports `resolveReasoningVariants`, which lists the reasoning levels a model can actually send (for example `Low`, `High`, `Max`, `Off`, or budget presets such as `High · 16k`) with the provider options for each. Catalog entries gain `capabilities.reasoningOptions`, and `canonicalizeModelId` is exported.
- Agents can ask the user questions with the `question` tool from `frogbot/tools`. The reply pauses at the question, the answer is saved with the chat, and the model continues the same assistant message. Questions work in the admin chat, `@frogbotai/ui`, and over HTTP through the `pending` and `settle` endpoints. FrogBot runs one turn per chat, whatever the source, and queues messages that arrive during a turn.
- Agents ask native questions in Slack, Discord, and Microsoft Teams channels. Participants answer with the platform's buttons, menus, forms, and cards, and the agent continues in the same thread. Channel pieces add questions with `channel.questions` from `frogbot/pieces`: the hooks return the messages and state FrogBot saves, FrogBot answers out-of-date clicks and replies itself, and when the next question of a set fails to post, FrogBot holds new answers with a "still posting" notice and retries as a job.
- The admin chat shows channel conversations read-only. A notice naming the channel replaces the composer, waiting questions read "Waiting for an answer in Slack" without controls, and Branch on the notice or on an assistant message continues the conversation privately in a new web chat. New channel messages appear on reload. Chats gain a virtual `channelLabel` field, and tool renderers receive `isReadonly` and `channelLabel`.
- `@frogbotai/db-sqlite` implements collection search: FTS5 lexical search, LibSQL vector search on a DiskANN index or exact, and hybrid reciprocal rank fusion, each in one SQL statement. Search tables, indexes, and triggers are part of development push and generated migrations.
- `@frogbotai/db-mongodb` implements collection search on deployments with MongoDB Search (Atlas or `mongot`): `$search` lexical search, `$vectorSearch` approximate or exact vector search, and hybrid reciprocal rank fusion with `$rankFusion`, or `$unionWith` on servers without it. The adapter creates and updates the collection's search indexes when it connects.
- `@frogbotai/db-d1-sqlite` implements lexical collection search with FTS5 tables and triggers that are part of development push and generated migrations. Cloudflare D1 has no native vector search, so an index with `vector` fails setup with `SearchCapabilityError` and reason `engine-gap`; vector fields still store values. Generated D1 migrations now import `MigrateUpArgs`, `MigrateDownArgs`, and `sql` from `@frogbotai/db-d1-sqlite`.
- Search indexes accept `vector.approximate` (default `true`) to choose between an approximate nearest-neighbour index and exact vector search, and an index-level `defaultCandidates` that replaces `hybrid.defaultCandidates`. The query's `candidates` now also applies to approximate vector search: Postgres uses it as `hnsw.ef_search` and SQLite as the `vector_top_k` neighbour count.

### Fixes

- Usage logs record the model that ran each step instead of the agent's default model.
- Queued messages and continuations after a dismissed client tool no longer drop the chosen model.
- Any signed-in user could create a message in another user's chat through the REST API.
- Any signed-in user could copy a message into another user's chat, including a channel conversation, with `POST /api/messages/:id/duplicate`. Messages can no longer be duplicated; use Branch to copy a conversation.
- A web message queued behind a running turn in a channel conversation had its reply posted to the channel thread, without the message it answered.
- The collapsed desktop sidebar rail was invisible: without Payload's `nav--nav-open` class the shell inherited `.nav { opacity: 0 }`.
- On viewports under 768px the main content collapsed to 0px wide because the hidden/overlaid sidebar left Payload's two-column grid in place. The template is now single-column while the drawer is closed or open.
- The mobile drawer gains a backdrop and closes on backdrop tap, Escape, and navigation.

### Tooling

- `pnpm bump` runs `pnpm sync:catalog` first, so each release ships a fresh model catalog.
- AI SDK packages are upgraded to their latest releases within the current major versions (`ai` 7.0.116).
- Added a Playwright suite (`pnpm test:browser`) that boots `templates/blank` and asserts the nav shell's layout in all four states. Run `pnpm test:browser:install` once to fetch Chromium.
