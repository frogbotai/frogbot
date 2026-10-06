# Step 2: Spec

A fresh drafter writes `step2_spec.md` from `issue.md` and the research Summary. The spec is the owner's main gate, approved with an `Approve:` line in `.idea/decisions/OPEN.md`.

- Copy the research Summary's rulings into `## Rulings` word for word: the same rows, or the same `none (read: …)` line.
- Number the requirements, and make each one testable.
- Where FrogBot does what Payload does, say so under Following Payload with `path:line`; the owner may veto any line. A recommendation equal to Payload's behaviour is not a card: it goes there.
- A card is for a choice only the owner can make. Facts are research: "which modes exist?" is not a card.
- Write each card so the owner can answer without asking what it means: a concrete situation and public-API code.
- Coordinators never paraphrase a card or make rulings. The owner's reply goes into `Answer:` word for word.
- Run `pnpm check ticket-docs <n>` before returning.

## Template

```markdown
# Ticket <n> — <title>

Status: Draft | Approved (<date>)

## Problem

<Who is affected, what happens today, why it matters. Link the research.>

## Rulings

- DR-<nnn> "<quote>" → <rule>. [source](link)

## Requirements

1. <Testable requirement.>

## Following Payload

The owner can veto any of these.

- <What FrogBot does the same way> (`~/code/payload/path:line`).

## Out of scope

- <Item> (ticket <n>, if one owns it).

## Acceptance criteria

1. <A command or observable result that proves a requirement.>

## Decisions

<Cards, or "None.">
```

## Decision card

The fields, in this order. Card IDs are `D1`, `D2`… within the ticket.

````markdown
### <n> D1 — <plain-language question>

- **Situation.** <What happens today, a concrete scenario, why the choice is needed now.>
- **Example.**
  ```ts
  // public-API code showing what each option looks like to a user
  ```
- **Payload does:** <behaviour> (`~/code/payload/path:line`), or `no equivalent (searched <terms>)`.
- **Options.** **A.** <result, benefit, cost>. **B.** <result, benefit, cost>.
- **Recommendation:** <option>, because <reason>.
- **Applies to:** this ticket | <`decisions.md` topic>
- Reply: `<n> D1: A` or `B`
- **Answer:**
````

`Applies to:` names a `decisions.md` topic when the answer should hold beyond this ticket; the answer then also becomes a ruling under that topic.
