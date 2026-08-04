# Step 2: Feature Description

## Problem

The manifest API playground generates an invalid doubled `/api/api` URL. The correct self-hosted gateway paths already exist in the AI configuration docs but are difficult to discover and easy to confuse with standalone gateway routes.

## User Stories

- As a docs reader, I want the manifest playground to target the real endpoint so that its generated request works.
- As a FrogBot app developer, I want to find the embedded gateway's exact paths from chat and gateway docs so that I call the correct API.
- As a gateway user, I want standalone and FrogBot-mounted routes clearly distinguished so that I do not mix their base paths.

## Core Requirements

- Use the full manifest endpoint URL in API frontmatter, matching existing API pages.
- Keep the self-hosted endpoint table in `configuration/ai.mdx` as the canonical copy.
- Link relevant chat and gateway pages to the canonical table with context about the embedded mount.
- Preserve the current `/api/ai/v1` namespace; the breaking `/api/v1` rename is excluded.

## Shared Component Inventory

- `docs/configuration/ai.mdx#call-over-http`: reuse as the canonical embedded-gateway endpoint reference.
- `docs/gateway/overview.mdx`: retain its standalone route table and extend its existing embedded-FrogBot callout.
- `docs/chat/overview.mdx` and `docs/chat/manifest.mdx`: add links rather than duplicate route data.
- No UI component, database, or runtime API changes are involved.

## User Flow

1. A reader opens the manifest, chat, or gateway documentation.
2. The page identifies whether it covers a FrogBot-mounted or standalone endpoint.
3. The reader follows the embedded-endpoint link when using a FrogBot app.
4. The canonical table provides the exact authenticated `/api/ai/v1/*` paths.

## Success Criteria

- The manifest playground resolves to `https://app.frogbot.ai/api/frogbot` without a doubled segment.
- Chat and gateway entry pages link to `/configuration/ai#call-over-http`.
- The standalone gateway route table remains intact and clearly scoped.
- No `/api/v1` namespace migration or runtime code change is included.
