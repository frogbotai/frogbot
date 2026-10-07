# Research: Ticket 900 — Good ticket

Status: Done (2026-10-05)

## Summary

- **Rulings:**
  - DR-001 "keep it simple" → Prefer the smallest change. [source](archive/notes.md#L1)
- **Q1 Where is an asset saved?** In `saveAsset` (`src/example.ts:1`).
  - What Payload does: `afterChange` hooks (`~/code/payload/src/config.ts:2`).
- **Decisions for the spec:** save on create or on update.
- **Risks:** none.

## Details

`saveAsset` returns the ID.
