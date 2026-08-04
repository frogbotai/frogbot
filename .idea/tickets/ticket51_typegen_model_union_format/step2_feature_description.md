# Step 2: Feature Description

## Problem

Generated FrogBot types are only partially formatted because the FrogBot-specific footer is appended after schema compilation. Long model unions are difficult to read and produce inconsistent generated files.

## User Stories

- As a FrogBot developer, I want long generated model unions to wrap predictably so that generated types are readable.
- As a maintainer, I want one formatter to own the complete generated artifact so that footer formatting cannot drift.

## Core Requirements

- Format the complete generated TypeScript artifact with Prettier defaults, TypeScript parsing, and single quotes.
- Wrap model unions only when they exceed the formatter's print width.
- Preserve model membership, ordering, short unions, empty unions, and deterministic no-op writes.
- Add regression coverage that fails against the current unformatted footer before changing implementation.

## Shared Component Inventory

- `compileTypes`: extend the canonical final-artifact assembly boundary.
- `buildGeneratedTypesFooter`: retain the canonical agent and model declaration source without adding a second formatter.
- `writeGeneratedTypes`: reuse the existing deterministic diff-and-write path unchanged.
- No UI, database, or external API surface is involved.

## User Flow

1. A developer configures one or more AI providers.
2. The developer runs `frogbot generate:types`.
3. FrogBot assembles and formats the complete generated file.
4. Long model unions wrap while short unions remain inline.

## Success Criteria

- A model union exceeding print width renders with `models:` on its own line and one leading-pipe member per line.
- A short model union remains inline.
- Repeating generation with unchanged configuration produces byte-identical output and no rewrite.
- Focused and full non-live tests pass.
