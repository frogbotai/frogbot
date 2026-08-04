# Step 3: Development Plan

**Branch:** `docs/gateway-endpoint-paths`

## Stage 1: Correct the Manifest Endpoint

- Goal: remove the doubled `/api/api` path from the generated API playground request.
- Dependencies: existing Mintlify API server configuration and absolute endpoint convention.
- Expected changes: replace the manifest's relative API frontmatter path with the complete hosted endpoint URL.
- Verification: run the relevant docs checks and inspect all API frontmatter to confirm the manifest no longer forms a relative-path exception.
- Risks/open questions: no automated Mintlify render check exists, so verify the concatenation rule against the configured server and resulting URL.
- Contract: `GET /api/frogbot`; no endpoint behavior changes.

## Stage 2: Reconcile Endpoint Documentation

- Goal: make the canonical FrogBot-mounted gateway route table discoverable without duplicating it.
- Dependencies: Stage 1 and the existing `configuration/ai.mdx#call-over-http` table.
- Expected changes: add contextual cross-links from the chat overview, manifest, and gateway overview; preserve the gateway page's standalone route table and clarify its scope.
- Verification: run the relevant docs checks, validate internal link targets, and inspect changed prose for standalone-versus-embedded consistency.
- Risks/open questions: Mintlify has no repository test for resolving internal anchors; retain the existing heading-derived anchor.
- Contract: canonical embedded routes remain `/api/ai/v1/*`; standalone routes remain `/v1/*` and bare paths.
