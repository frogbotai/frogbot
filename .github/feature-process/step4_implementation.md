# Step 4: Implement

After the owner says **Go**, the coordinator runs `pnpm ticket new <n>` and starts a fresh worker for each stage of the plan. Each worker reads the spec, the plan and this log, does its stage, and appends one entry to `step4_implementation.md`.

- Stay within the stage. Add anything else you find with `pnpm ticket found --repo <repo> <<'EOF'`, then the `<kind> · <area> · <text>` row on one line, then `EOF`. It files an issue labeled `found`; put its URL in the log.
- A spec with `## Design cases` starts with one browser test per row, written before the feature, in the real app or the fixture the row names. The feature is done when every row passes. Each test can save a screenshot of its case for the PR.
- Verify by [tier](README.md#tiers), following [CONTRIBUTING.md](../../CONTRIBUTING.md#verification). The coordinator lands the ticket with `pnpm ticket land <n>`.
- The log records state. The story of the change goes in the commit message.

## Log format

```markdown
# Implementation: Ticket <n> — <title>

## Stage 1 — <goal>

- Done: <what changed, one line each>.
- Next: <the next stage, or "land">.
- Commands:
  - `<command>`: <one-line result>.
- Found: <F-012, F-013>, or none.
```
