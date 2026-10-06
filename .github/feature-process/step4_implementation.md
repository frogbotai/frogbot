# Step 4: Implement

After `Go:`, the coordinator runs `pnpm ticket new <n>` and starts a fresh worker for each stage of the plan. Each worker reads the spec, the plan and this log, does its stage, and appends one entry to `step4_implementation.md`.

- Stay within the stage. Add anything else you find with `pnpm ticket found "<kind> · <area> · <text>" --source <log path>`, which picks the next free `F-` number, and put that number in the log. Don't number rows by hand.
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
