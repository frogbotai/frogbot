# Step 3: Plan

A fresh planner writes `step3_plan.md` from the approved spec and the research Summary. The owner reads the batch's plans before writing `Go:`; each worker is told "follow `step3_plan.md`".

- `touches:` comes first: every path or glob the ticket will change. It sets the [tier](README.md#tiers) and which tickets can run side by side, so make it complete.
- Name the Payload precedent for the approach, or say it is FrogBot-specific.
- Give each alternative one line, with why not.
- Each stage is one fresh worker's job. `Verify:` is the exact command that proves it; `Evidence:` is where the result is kept, a path or a ledger level (`typecheck`, `unit`, `int`, `ui`).
- A new decision found while planning becomes a card in the spec and goes back to the inbox. Don't settle it in the plan.
- Run `pnpm check ticket-docs <n>` before returning.

## Template

```markdown
# Plan: Ticket <n> — <title>

Status: Draft | Go (<date>)

touches:

- <path or glob>

## Approach

<How, in a few sentences.> Payload precedent: <what> (`~/code/payload/path:line`), or FrogBot-specific.

## Alternatives

- <Option>: <why not>.

## Stages

1. <Goal>.
   - Verify: `<exact command>`
   - Evidence: <path or ledger level>
```
