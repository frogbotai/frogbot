# Step 1: Solution Assessment

## Problem

FrogBot needs opt-in, per-key language payload capture without weakening its default zero-retention posture or Node 20 support.

## Option A: Self-contained capture plugin with explicit integration

- Pros: keeps capture optional; uses existing hooks; supports renamed API-key collections explicitly; works on Node 20 with gzip; custom storage remains provider-neutral.
- Cons: plugin order and a matching `apiKeysCollectionSlug` are required when the API-key collection is renamed; finite retention requires storage cleanup support.

## Option B: Extend core usage logging and Payload upload storage

- Pros: one built-in metadata/content path; no separate storage contract.
- Cons: makes sensitive content capture a core concern; Payload storage adapters require upload collections; couples opaque captures to OLTP/media lifecycle.

## Option C: Add cross-plugin registration infrastructure first

- Pros: automatic API-key collection discovery and reusable plugin interoperability.
- Cons: expands issue scope and changes the plugin API solely to remove one explicit option.

## Recommendation

Choose Option A. Capture one request per operation, resolve `context.capture === false` first, then per-key policy, then global default; apply the global default to non-key and in-process calls. Use stable gzip (`{requestId}.json.gz`), sample once per request, default to `off`, and require custom storage cleanup support only when finite retention is configured.
