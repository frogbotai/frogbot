# Step 2: Spec

A fresh drafter writes `step2_spec.md` from `issue.md` and the research Summary. The spec is the owner's main gate. The coordinator brings it to the owner in chat, as in [Asking the owner](#asking-the-owner); the owner never opens a file to answer.

- Start with `## Brief`: at most 100 plain words, with no code or paths. Say what changes for the person using it (before and after), what the owner is asked to choose, and the main risk. Write it the way you'd explain it to a colleague in chat. It is often all the owner reads.
- Copy the research Summary's rulings into `## Rulings` word for word: the same rows, or the same `none (read: …)` line.
- Number the requirements, and make each one testable.
- `## Core changes` lists every change under `packages/frogbot`, or says `None.`. For each, name its generic seam and the existing hook, collection hook, access function or export that can't do the job; decide with [Core or plugin](../../CONTRIBUTING.md#core-or-plugin). `pnpm check ticket-docs` fails a Draft spec without it.
- Name the precedent that fits the ticket: Payload for app-builder work, OpenCode v2 for agent-harness work (DR-041), and Claude for Chrome as well for Sidekick's browser tools. Where FrogBot does what it does, say so under `## Following <precedent>` with `path:line`; the owner may veto any line. A recommendation equal to the precedent is not a card: it goes there.
- A card is for a choice only the owner can make. Facts are research: "which modes exist?" is not a card.
- Write each card so the owner can answer without asking what it means: a concrete situation and public-API code.
- Run `pnpm check ticket-docs <n>` before returning.

## Template

```markdown
# Ticket <n> — <title>

Status: Draft | Approved (<date>)

## Brief

<At most 100 plain words: what changes for the user, what the owner chooses, the main risk.>

## Problem

<Who is affected, what happens today, why it matters. Link the research.>

## Rulings

- DR-<nnn> "<quote>" → <rule>. [source](link)

## Requirements

1. <Testable requirement.>

## Core changes

<"None." or one bullet per core change: the change, its generic seam, and the existing hook, collection hook, access function or export that was ruled out.>

## Following <Payload | OpenCode v2 | Claude for Chrome>

The owner can veto any of these.

- <What FrogBot does the same way> (`~/code/<repo>/path:line`).

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
- **Precedent:** <which one> <behaviour> (`~/code/<repo>/path:line`, or a URL), or `no equivalent (searched <terms>)`.
- **Options.** **A.** <result, benefit, cost>. **B.** <result, benefit, cost>.
- **Recommendation:** <option>, because <reason>.
- **Applies to:** this ticket | <`decisions.md` topic>
- Reply: `<n> D1: A` or `B`
- **Answer:**
````

`Applies to:` names a `decisions.md` topic when the answer should hold beyond this ticket; the answer then also becomes a ruling under that topic.

## Asking the owner

The coordinator runs `pnpm ticket decisions` to list what is waiting (parked tickets are left out), then asks in chat, one message grouped by ticket:

- the spec's Brief;
- each open card as a one-line question, then one line per option saying what happens and why, with "(recommended)" on the recommended option. No code, paths or citations;
- last, "Anything to change, or good to go?" That one reply is the approval: there is no second place to answer.

```text
329: honest tool results
Sidekick sometimes says a step failed when it worked, so the model repeats it. After this, "OK" and "failed" are true.
- D1, when a page swaps the text box right after typing:
  - A (recommended): find the new box and check the text is in it. "OK" then really means the text went in.
  - B: don't check, like OpenCode v2 and Claude for Chrome. Simpler, but "OK" is a guess.
Anything to change, or good to go?
```

When the owner asks for more ("more on 329 D1"), give the full card, then the evidence it cites.

The owner answers in their own words. The coordinator records the reply, the owner's words after the colon unchanged (DR-007):

```sh
pnpm ticket decisions <<'EOF'
329 D1: B, like Claude for Chrome
329 approve
EOF
```

| Line                        | When                                                | Writes                                                                             |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `<n> D<k>: <owner's words>` | an answer; indent any further lines                 | the card's `Answer:`, and a `decisions.md` ruling when `Applies to:` names a topic |
| `<n> note: <owner's words>` | the owner asks for a change instead of saying go    | the spec's Owner notes; it stays Draft for the drafter to revise                   |
| `<n> approve`               | the owner says good to go                           | `Status: Approved (<date>)`; refused while a card has no answer                    |
| `go <batch>`                | the owner says Go for a batch whose plans all exist | `Status: Go (<date>)` on each plan                                                 |

One bad line refuses the whole reply and writes nothing. When it isn't clear what the owner chose, ask again rather than guess.
