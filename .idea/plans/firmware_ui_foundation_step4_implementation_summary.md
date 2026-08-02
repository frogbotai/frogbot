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
