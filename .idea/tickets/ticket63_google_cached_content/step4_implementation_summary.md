## Stage 1 - Contract Tests
- Changes: Added parse contracts for `cached_content` and the `prompt_cache_key` fallback, Google/Vertex namespace and handler routing contracts, an unrelated passthrough guard, and streaming cache-usage coverage. Existing non-streaming cache-usage coverage remains the canonical pin.
- Verification: Focused tests were run before implementation; the new parse and alias-routing contracts fail as expected while existing routing, passthrough, and usage behavior passes.
- Notes: Ticket 64's shared cache wire harness is not present on `main`, so the existing handler specs provide the wire-level seam without introducing a competing harness.

## Stage 2 - Explicit Routing
- Changes: Added `cached_content` to the handled request fields and extended `parsePromptCachingOptions` to validate and route it. The chat handler maps `prompt_cache_key` to `cached_content` only for Google and Vertex when no explicit cache resource is supplied.
- Verification: The focused Stage 1 contract suite passes (74 tests), including Google and Vertex routing, typed rejection, alias mapping, passthrough preservation, and both usage translators. The full gateway unit suite passes (965 passed, 3 todo).
- Notes: No top-level schema field, namespace remap, `/v1/messages` behavior, or unrelated cache behavior was added. A contract confirms the alias does not add `cachedContent` for other providers.

## Stage 3 - Documentation and Integration Verification
- Changes: Documented `cached_content`, its Google/Vertex scope, `cachedContents/{id}` format, `prompt_cache_key` fallback, and externally managed resource lifecycle.
- Verification: The full gateway unit, integration, and golden suite passes (1,155 passed, 3 expected failures, 28 todo). The docs fence check passes (109 files, 723 fences).
- Notes: Build was not run because the available gateway and root build scripts invoke `tsc`; lint and typecheck remain delegated as requested. Ticket 64's cache matrix is not present on this base, so no matrix cells were changed.
