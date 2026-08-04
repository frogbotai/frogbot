# Research: `frogbot generate:types` models union is not formatted (issue #46)

**Status:** researched
**Ticket:** .idea/issue_triage.md → Ticket 51
**Branch (planned):** fix/typegen-format

## Revision

- 2026-08-03: Step 4 found that generated-footer assertions explicitly expected double-quoted agent and model keys. They codified the unformatted footer's quote style and must change to Prettier's single-quoted model literals and unquoted safe agent keys with the formatting fix.

## Issue Summary

`frogbot generate:types` writes the `GeneratedTypes.models` string-literal
union all on one line (`models: 'a' | 'b' | 'c' | ...;`). The owner wants the
generated `frogbot-types.ts` formatted the way Prettier would format it —
one union member per line, `models:` on its own line with a leading `|` per
member — matching the shape shown in the issue body. This is a pure DX/output
formatting bug; no runtime behavior changes.

## Reproduction

1. Configure `ai.providers` with a provider that resolves 5+ catalog models
   (e.g. `amazon-bedrock: true`).
2. Run `frogbot generate:types`.
3. Open `frogbot-types.ts` — the `models:` line inside `GeneratedTypes` is one
   long line: `models: 'amazon-bedrock/...' | 'amazon-bedrock/...' | ...;`
   instead of the desired multi-line union.

## Current Behavior (our code)

`packages/frogbot/src/bin/generateTypes.ts`:

- `getConfiguredModelIds` (`generateTypes.ts:40-68`) resolves the sorted list
  of model-id strings.
- `buildGeneratedTypesFooter` (`generateTypes.ts:70-89`) builds the footer as
  a hand-written template literal:
  ```
  const models = modelIds.length === 0 ? 'never' : modelIds.map((id) => JSON.stringify(id)).join(' | ');
  return `declare module 'frogbot' {
    export interface GeneratedTypes extends Config {
      agents: ${agents};
      models: ${models};
    }
  }`;
  ```
  (`generateTypes.ts:81-88`) — `.join(' | ')` always produces one line, with
  no width-awareness or wrapping.
- `compileTypes` (`generateTypes.ts:157-196`) calls `compile(jsonSchema, ...)`
  from `json-schema-to-typescript` (`generateTypes.ts:182-189`) to produce the
  Payload-shape interfaces (`Config`, `Thread`, `Message`, etc.) — this part
  **is** Prettier-formatted (see below). The footer is concatenated onto the
  compiled string **after** `compile()` has already returned, with no further
  formatting pass:
  ```
  return `${compiled.trimEnd()}\n\n\n${buildGeneratedTypesFooter(agentSlugs, ai)}\n`;
  ```
  (`generateTypes.ts:195`).

So the file has two assembly paths: the schema-derived interfaces go through
`compile()`'s internal Prettier formatter; the hand-built footer (`agents` /
`models`) is appended as a raw string and never touches a formatter. The
`agents` map already happens to be hand-formatted one-key-per-line
(`generateTypes.ts:74-79`) closely mimicking Prettier's own object-literal
wrapping, but `models` was written with a naive single-line join.

## Root Cause

`json-schema-to-typescript`'s `compile()` runs every generated declaration
through Prettier before returning
(`node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/dist/src/index.js:104-108`
calls `formatter_1.format(generated, _options)`, and
`.../dist/src/formatter.js:13-19`:
```js
function format(code, options) {
    if (!options.format) { return code; }
    return prettier_1.format(code, Object.assign({ parser: 'typescript' }, options.style));
}
```
— i.e. Prettier with `parser: 'typescript'` plus whatever `style` object was
passed to `compile()` (FrogBot passes `style: { singleQuote: true }`,
`generateTypes.ts:184`)). This formatting only covers the string `compile()`
is given — the JSON-schema-derived interfaces. FrogBot's `GeneratedTypes`
footer (agents/models) is built and appended by `buildGeneratedTypesFooter`
entirely outside that call, so it never passes through Prettier. The bug is
a **missing formatting pass over the final assembled artifact**, not a
Prettier configuration problem — Prettier's default `printWidth: 80` already
wraps a 12-member union exactly the way the issue requests (verified below).

The user-visible contract: `frogbot-types.ts` is presented to developers as a
normal generated TypeScript file they will read/diff; the whole file should
look Prettier-formatted, consistent with every other declaration in it and
with Payload's own generated `payload-types.ts` convention. The internal
detail is that the file is currently assembled from two separately-built
strings (schema interfaces + hand-built footer) and only one half is run
through a formatter.

## Source of Truth and Ownership

The single owning boundary is **the final string assembly point in
`compileTypes`** (`generateTypes.ts:195`), where `compiled` (already
Prettier-formatted by `compile()`) and the footer are concatenated. Today
formatting is split: `compile()` formats its half, `buildGeneratedTypesFooter`
hand-crafts a partial imitation of formatting for `agents` and none at all
for `models`. The fix should format the *entire* assembled string once, at
this single point, rather than adding more hand-crafted line-wrapping logic
to `buildGeneratedTypesFooter` (which would be a second, divergent formatting
implementation to keep in sync with Prettier's actual behavior — e.g. its
line-length-aware wrapping decisions, quote style, etc.). There must not be
two competing "how do we format a TS union" implementations in this file.

## Complete Path Audit

- **Zero models** (`modelIds.length === 0`): footer emits `models: never;` —
  short, single line, already fits under any formatter's width; no visible
  change needed but will still pass through the formatter harmlessly
  (`generateTypes.ts:81`).
- **Few models (fits in 80 cols)**: Prettier will keep `models: 'a' | 'b';`
  on one line — verified below (Prettier only breaks unions that exceed
  `printWidth`). This preserves today's existing short-union test
  expectations (e.g. `generateModelTypes({ providers: { openai: true } })` in
  `generateTypes.spec.ts:281-286`, which only has 1-2 catalog models for a
  single provider and asserts substrings, not exact single-line shape).
- **Many models (issue's case)**: wraps one member per line with leading
  `|`, `models:` alone on its own line — verified below.
- **`agents` map**: currently hand-formatted to look right for the common
  cases tested (`generateTypes.spec.ts:125-134`); once the whole file is
  Prettier-formatted, the hand-formatting becomes redundant but harmless
  (Prettier will normalize it either way) — no separate fix needed for
  `agents`, but the fix should stop relying on hand-formatted agents/models
  strings being "close enough" and let Prettier own the final shape
  uniformly.
- **`extraTypeStrings` footer** (custom `interfaceName` opt-ins,
  `generateTypes.ts:191-193`) — also concatenated after `compile()` outside
  its formatting pass; folding the final-format step in after all
  concatenation (not just after the footer) covers this path too.
- **Diff/no-op write path** (`writeGeneratedTypes`, `generateTypes.ts:198-221`)
  — compares byte-for-byte against the existing file; formatting must remain
  deterministic across repeated runs (Prettier is deterministic for stable
  input) so the "unchanged" short-circuit still works.

## Assumption Audit

- **"Payload's own `payload-types.ts` is Prettier-formatted via
  `json-schema-to-typescript`'s `format` option."** — VERIFIED.
  `packages/payload/src/bin/generateTypes.ts:37-49` calls `compile(jsonSchema,
  'Config', { style: { singleQuote: true }, ... })` with no `format: false`,
  and `json-schema-to-typescript`'s default is `format: true`
  (`node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/dist/src/index.js:40`).
- **"FrogBot's generator already reuses part of Payload's pipeline
  (`configToJSONSchema` + `compile`) and appends the models union outside
  it."** — VERIFIED. `generateTypes.ts:23` imports `configToJSONSchema` from
  `payload`; `generateTypes.ts:182-189` calls the same `compile()`; the footer
  is concatenated at `generateTypes.ts:195`, strictly after `compile()`
  returns, with no further formatting call in between.
- **"`compile()`'s internal formatter uses Prettier, not some other
  formatter."** — VERIFIED.
  `.../dist/src/formatter.js:13` — `const prettier_1 = require('prettier')`.
- **"Prettier is available to `packages/frogbot` at runtime without adding a
  new direct dependency."** — VERIFIED. `packages/frogbot/package.json` lists
  `json-schema-to-typescript: ^15.0.3` as a direct dependency
  (`packages/frogbot/package.json:44`); `json-schema-to-typescript`'s own
  `package.json` lists `prettier: ^3.2.5` as one of its runtime
  `dependencies` (verified by reading
  `node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/package.json`
  — the `dependencies` block includes `"prettier": "^3.2.5"`, and it is
  resolvable from `packages/frogbot` via
  `require.resolve('json-schema-to-typescript/package.json')` →
  `node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/package.json`,
  proving pnpm's node-linker makes it reachable in this workspace). Root
  `package.json:47` also lists `prettier: ^3.2.5` as a devDependency used for
  repo-wide lint/format tasks — a second, independent route to the same
  major version, reinforcing there is no version mismatch risk.
- **"Formatting the assembled string with Prettier (`parser: 'typescript'`,
  `singleQuote: true` — the same options FrogBot already passes to
  `compile()`) reproduces the exact multi-line shape shown in the issue."**
  — VERIFIED by direct execution: ran
  `require('prettier').format(<the file's declare-module footer text with
  the issue's 12 bedrock model ids>, { parser: 'typescript', singleQuote:
  true })` inside `packages/frogbot` and the output matches the issue body's
  desired shape byte-for-byte — `models:` alone on its own line, one
  `| 'amazon-bedrock/...'` member per line, `singleQuote` honored.
- **"No existing test asserts the current single-line shape as required
  behavior (i.e. nothing needs to be un-codified as broken-but-expected)."**
  — VERIFIED. Every assertion in `generateTypes.spec.ts` touching
  `models`/model-id output uses `.toContain('"provider/model"')`
  (`generateTypes.spec.ts:261,284-285,293-294,310-313,328-329,337-338,345-347`),
  which passes regardless of whether the union is wrapped across lines or
  not (the quoted id substring is unaffected by the surrounding `|`
  placement/newlines). The one test with an inline union
  (`role: 'user' | 'assistant' | 'system';`, `generateTypes.spec.ts:185`) is
  asserting a schema-derived enum inside a short interface that already
  fits under 80 columns and is already Prettier-formatted by `compile()`
  today — it will remain single-line after the fix (see the "few models"
  path in Complete Path Audit).
- **"Prettier only wraps a union across lines when it does not fit
  `printWidth` (default 80), so short unions stay inline and existing
  short-union test expectations do not regress."** — VERIFIED via the same
  local execution: a 2-member union
  (`models: 'openai/gpt-4o' | 'openai/gpt-4o-mini';`) formatted through the
  identical Prettier call stays on one line (confirmed by re-running the
  formatter against the `generateModelTypes({ providers: { openai: true } })`
  scenario's output shape, which is well under 80 columns), consistent with
  Prettier's documented `printWidth` behavior
  (https://prettier.io/docs/en/options.html#print-width — "Prettier will
  try to wrap on `printWidth`... not... a hard limit... [but] the whole
  content must be no longer than 80 characters" per line for that
  construct type).

No load-bearing assumption is INFERRED.

## Reference Behavior

- **Payload** (`packages/payload/src/bin/generateTypes.ts:37-49`): compiles
  the schema through `compile()` with `format: true` (default) and Prettier
  `style.singleQuote`, then appends its own trivial footer
  (`declare module 'payload' { export interface GeneratedTypes extends
  Config {} }`, lines 34-35, 59-65) **after** `compile()` — the exact same
  "compile, then append footer" shape FrogBot follows. Payload's footer never
  manifests this bug only because it has no union member list to wrap
  (`extends Config {}` has no long line). This confirms FrogBot's overall
  assembly pattern mirrors Payload's own convention; the fix does not need
  to deviate from that pattern, it needs to close the one gap Payload never
  needed to close (a long generated union).
- **json-schema-to-typescript** (`dist/src/index.js:104-108`,
  `dist/src/formatter.js:13-19`): formatting is a single explicit call,
  `formatter.format(generated, options)`, run once over the entire compiled
  string right before returning — i.e. the library's own design intent is
  "format the whole artifact once at the boundary," not per-declaration.
  This is the pattern FrogBot's fix should extend to cover the footer too.
- **AI SDK / opencode / Hermes Agent / Portkey / Hebo**: not applicable —
  this is a local TypeScript codegen formatting concern specific to
  FrogBot's `generate:types` CLI command; none of these repos generate or
  format a comparable artifact.

## Proposed Fix Direction

Run the entire assembled string (compiled interfaces + `extraTypeStrings` +
`buildGeneratedTypesFooter` output) through Prettier **once**, at the single
assembly boundary in `compileTypes` (`generateTypes.ts:157-196`), instead of
only formatting the `compile()` half and hand-crafting the footer's layout.

Concretely, in `generateTypes.ts`:
1. Import `prettier`'s `format` directly (`import { format } from
   'prettier';`) — acceptable because `prettier` is already a resolvable
   dependency of `packages/frogbot` transitively through
   `json-schema-to-typescript` (verified above); if repo convention prefers
   explicit dependencies over transitive resolution for import statements,
   promote `prettier` from transitive to an explicit `dependencies` entry in
   `packages/frogbot/package.json` pinned to the same `^3.2.5` range already
   used at the root and by `json-schema-to-typescript`, to avoid relying on
   node_modules hoisting behavior.
2. Change the return of `compileTypes` (`generateTypes.ts:195`) from:
   ```ts
   return `${compiled.trimEnd()}\n\n\n${buildGeneratedTypesFooter(agentSlugs, ai)}\n`;
   ```
   to build the full unformatted string first, then format it once:
   ```ts
   const full = `${compiled.trimEnd()}\n\n\n${buildGeneratedTypesFooter(agentSlugs, ai)}\n`;
   return format(full, { parser: 'typescript', singleQuote: true });
   ```
   (matching the exact `parser`/`style` options already passed to
   `compile()` at `generateTypes.ts:182-189`, so both halves land in the
   same formatting convention).
3. Simplify `buildGeneratedTypesFooter`'s `agents` construction
   (`generateTypes.ts:74-79`) back to a plain, unformatted expression (e.g.
   build a single-line object literal or the simplest correct string) since
   Prettier now owns final layout — removes the need to hand-imitate
   Prettier's object-wrapping decisions in application code.
4. `models` (`generateTypes.ts:81`) can stay as the simple `.join(' | ')` —
   Prettier will wrap it when needed.
5. `writeGeneratedTypes` (`generateTypes.ts:198-221`) needs no change;
   `compileTypes`'s return value is still a single deterministic string.

**Rejected alternative — hand-format the union string** (e.g. detect length
and manually emit `\n      | 'x'` per member in `buildGeneratedTypesFooter`):
rejected because it creates a second, hand-maintained formatting
implementation that has to track Prettier's actual wrapping rules
(printWidth, indentation depth, trailing semicolon placement, quote style)
by hand and will drift the moment Prettier's defaults or FrogBot's chosen
`style` options change elsewhere. It also does nothing for the `agents` map
or `extraTypeStrings`, leaving two formatting paths instead of one. The
single-format-pass fix restores the actual owning invariant (this whole file
is a Prettier-formatted artifact) instead of patching one symptom.

## Why Tests Missed It

No existing spec asserts formatting/layout of the generated file at all.
`generateTypes.spec.ts`'s model-related assertions
(`generateTypes.spec.ts:261,284-285,293-294,310-313,328-329,337-338,345-347`)
use `.toContain('"provider/model"')` substring checks, which are indifferent
to whether the surrounding union is inline or wrapped across lines — they
would pass identically before and after this fix. The suite has no test that
reads the generated file and asserts on its line structure/shape for a
long union, so the single-line-vs-multi-line regression was invisible to it.
This is a **suite-level gap**: generated-artifact specs assert *content*
presence but never assert *formatting* of long/wrapping constructs.
Candidate addition to `.idea/test_hardening_todo.md`: "codegen specs that
produce Prettier-formatted output must include at least one case whose
output exceeds `printWidth` to assert the wrap actually happens, not just
that the tokens are present."

## Regression Tests That Prove the Issue

Target file: `packages/frogbot/src/bin/generateTypes.spec.ts`.

New test cases (tagged `it.fails` until the fix lands, per Step 4 process):

1. **"wraps the models union across lines when it exceeds the print width"**
   — Arrange: configure enough catalog models to exceed 80 characters when
   joined inline (e.g. `providers: { 'amazon-bedrock': true }`, which the
   catalog already resolves to a dozen+ model ids per the issue's own
   example — confirm exact count via `catalog` at test time rather than
   hardcoding). Act: `generateModelTypes(...)` (existing helper,
   `generateTypes.spec.ts` — locate its definition) or
   `writeGeneratedTypes` + read the file. Assert: `output` matches a regex
   like `/models:\s*\n(\s*\|\s*'[^']+'\n)+/` (models on its own line,
   followed by one `| '...'` member per line) — this FAILS today because
   the real output is `models: 'a' | 'b' | ...;` all on one line, and PASSES
   after the fix.
2. **"keeps a short models union inline"** — Arrange:
   `providers: { openai: true }` (few models). Assert: `output` contains a
   single line matching `/models: '[^']+' \| '[^']+';/` with no newline
   between `models:` and the first quote — guards against over-formatting
   (accidentally always wrapping) once the fix is Prettier-driven.
3. **"produces byte-identical output on a second run (idempotent, still
   diff-clean after formatting)"** — Arrange: run `writeGeneratedTypes`
   twice against the same config/dir. Assert: second call returns
   `{ changed: false }` — guards that Prettier's formatting is deterministic
   and the existing no-op short-circuit (`generateTypes.ts:210-217`) still
   works post-fix.

No mocking of `compile()`/`prettier` is needed — these tests exercise the
real `writeGeneratedTypes` → `compileTypes` → filesystem boundary, matching
how every other test in this file already operates (e.g.
`generateTypes.spec.ts:240-263`).

## Risks / Open Questions

- Whether to add `prettier` as an explicit `dependencies` entry in
  `packages/frogbot/package.json` versus relying on the transitive
  resolution through `json-schema-to-typescript`. Explicit is safer against
  future major-version bumps of `json-schema-to-typescript` dropping or
  changing its `prettier` dependency; recommend making it explicit.
- Formatting the whole file adds one more async Prettier call per
  `generate:types` invocation — negligible cost (this is a CLI codegen
  command, not a hot path).
- Need to confirm the exact catalog contents used in tests remain stable
  enough to reliably exceed 80 columns (test should assert on structure via
  regex, not a hardcoded catalog snapshot, to avoid churn when the catalog
  changes).

## Scope Check

Issue #46 requests exactly one thing: the generated `models` union (and by
extension the whole generated file) should look Prettier-formatted with one
union member per line when it doesn't fit on one line — matching the shape
shown in the issue body. This research's fix direction (format the whole
assembled string once via Prettier, reusing the same options already passed
to `compile()`) delivers exactly that and nothing more: no new CLI flags, no
new config options, no change to which models are included or how
`getConfiguredModelIds` resolves them. Nothing is deferred.

## Sources

- `packages/frogbot/src/bin/generateTypes.ts` (read in full)
- `packages/frogbot/src/bin/generateTypes.spec.ts` (read relevant sections:
  lines 1-350, focused reads at 60-140, 240-350)
- `packages/frogbot/package.json` (read in full)
- `package.json` (root, grepped for `prettier`)
- `/Users/colbygilbert/Documents/Code/payload/packages/payload/src/bin/generateTypes.ts`
  (read in full)
- `node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/dist/src/index.js`
  (read `compile()` body, lines 80-115)
- `node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/dist/src/formatter.js`
  (read in full)
- `node_modules/.pnpm/json-schema-to-typescript@15.0.4/node_modules/json-schema-to-typescript/package.json`
  (grepped `dependencies`/`prettier`)
- Live verification: executed
  `require('prettier').format(<footer text>, { parser: 'typescript', singleQuote: true })`
  in `packages/frogbot` via `node -e` with the issue's exact 12 bedrock model
  ids — output matched the issue body byte-for-byte.
- `gh issue view 46 --repo frogbotai/frogbot --json title,body,comments`
- https://prettier.io/docs/en/options.html#print-width (Prettier `printWidth`
  semantics — wraps only when content doesn't fit, not a hard truncation
  limit)
- `.idea/tickets/_TEMPLATE.md`, `.idea/tickets/PROCESS.md` (process docs read
  in full per assignment)
