# Firmware UI Foundation — Step 4 Implementation Summary

## Stage 1 — Lock Contracts and Visual Baselines

- Added expected-failure SDK coverage for `{ baseURL, headers?, fetch? }` and URL composition without adding the SDK package.
- Locked the stable attachment shape `{ id, filename, mediaType }` and proved inline data URLs still enter the current chat request pipeline.
- Captured the canonical Firmware composer shell classes from `packages/ai-chat/src/components/MultimodalInput/index.tsx` and gradient treatment from `packages/ui/src/scss/core.scss`.
- Kept later-stage SDK, runtime wiring, uploads, server resolution, theme, and composer implementation out of Stage 1.

## Stage 2 — Create the FrogBot SDK Package

- Added the framework-agnostic `@frogbotai/sdk` package with `{ baseURL, headers?, fetch? }` configuration.
- Ported Payload's URL, header, JSON, multipart, and typed HTTP error transport under FrogBot naming.
- Added focused unit coverage and package build configuration without wiring UI or implementing uploads.

## Stage 3 — Wire Runtime Server Configuration

- Made `ChatPlatformAdapter.apiBase` the single runtime server URL and removed the competing `Chat.apiBase` input.
- Constructed one FrogBot SDK instance in `ChatProvider` and routed manifest, persistence, mutations, and chat transport through it.
- Preserved custom fetch implementations and static or dynamic adapter headers without relying on `process.env` or framework globals.
- Added browser-focused coverage for absolute runtime URLs, headers, custom fetch, and existing text chat behavior.

## Stage 4 — Port Firmware Theme Foundations

- Replaced the invented FrogBot OKLCH theme with Firmware's base, brand, semantic, typography, radius, and reciprocal dark-mode foundations.
- Normalized shared buttons, inputs, selects, and cards to Firmware's control states and geometry.
- Kept the Firmware composer shell and its expected-failure baseline unchanged for Stage 5.
- Exact deviations: Satoshi remains loaded from Firmware's `/fonts/*` public URL contract because the UI package does not own application public assets; unused extended color families remain deferred until a canonical FrogBot surface consumes them.

## Stage 5 — Port the Firmware Composer Shell

- Rebuilt the canonical FrogBot Composer with Firmware's gradient wrapper, rotating conic surround, 20px nested shell, textarea geometry, control row, responsive sizing, and focus, drag, and disabled states.
- Replaced visible text actions with Firmware's round arrow and stop controls while retaining accessible consumer-provided labels.
- Kept attachment, tool, page-context, reusable-prompt, plan, and microphone controls hidden because their behavior was not implemented; file drops only rendered the drag state and were discarded.
- Converted the Stage 1 expected-failure composer baseline and added focused submit, stop, controlled-input, drag, and disabled-state coverage.
- Exact deviations: Firmware's unavailable attachment, tool, page-context, reusable-prompt, plan, and microphone controls were omitted; attachment previews and audio waveform were omitted; reduced-motion users receive a static gradient; consumer start and end slots remain supported by FrogBot's existing public Composer contract.

## Stage 6 — Upload Files on Selection

- Added the canonical files collection slug to the FrogBot manifest and a focused SDK multipart upload method.
- Added immediate selection and drop uploads, upload previews, errors, removal, and retry to the canonical Composer.
- Sent and persisted only stable `{ id, filename, mediaType }` FrogBot references as `file-reference` message parts, including attachment-only messages.
- Kept local preview URLs out of message state and did not add inline base64, provider IDs, server-side resolution, voice, or syntax behavior.
- Risk: removing or abandoning an uploaded attachment can leave an orphaned file. Stage 6 does not cancel in-flight requests or delete uploaded records because ownership and safe cleanup semantics are not yet defined; retries can also create an orphan if the first request succeeds after the client observes failure.

## Stage 7 — Resolve Files Server-Side

- Resolved every stable file ID through the configured files collection with request-scoped access enforcement before provider invocation.
- Read configured local storage directly and fetched cloud or private storage through Payload-generated file URLs with request credentials.
- Converted authorized records to ephemeral server-side AI SDK file parts while retaining only stable FrogBot references in persisted messages.
- Covered denied and missing records, mixed text and files, client metadata replacement, local reads, private cloud fetches, and AI SDK conversion.
- Risk: cloud adapters must expose a fetchable document URL or Payload static handler; remote fetches buffer each attachment in memory, and provider media support and size limits remain provider-specific.
