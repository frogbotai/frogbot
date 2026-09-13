# Step 1: Feature description

Start after [Step 0](step0_research.md)'s independent research review, unless resuming approved work or the owner has [skipped planning](FEATURE_DEVELOPMENT_PROCESS.md#when-to-use-this-process). Read the ticket's `research.md` and linked current contracts first. Deliver `step1_feature_description.md` in the feature's local planning folder.

## Objective

Agree on the problem and what users should be able to do before choosing how to build it. Identify the decisions the owner must make before Step 2.

## Structure

- **Problem:** who is affected, what happens today, and why it matters.
- **Evidence:** link reviewed research, the code version it checked, requirements shared across tickets, and existing owner decisions.
- **User stories:** “As [role], I want [goal] so that [benefit].”
- **Requirements and exclusions:** what users and developers should see or be able to do, and what this feature will not cover.
- **Existing features:** relevant UI screens, API endpoints, and shared components or interfaces; link evidence and identify what to reuse. Compare implementation approaches in Step 2.
- **User flow:** numbered steps, including important failure outcomes.
- **Success criteria:** observable outcomes that can be verified.
- **Owner decisions:** open questions in the format below, or “None — no owner decisions remain.” Link existing rulings rather than asking again.

## Owner decisions

Research facts first. “Which credential modes exist?” is a research task; “Which verified modes should we support in this release?” may be an owner decision. Do not outsource code inspection or routine implementation choices to the owner.

Give each decision a stable ID and one concrete question. Include enough context in both the document and the chat/question-tool prompt that the owner can answer without opening links or asking “what does that mean?” Links support the explanation; they do not replace it.

```markdown
### D1 — {plain-language decision question}

- Status: Open; blocks Step 2 / non-blocking, deferred to {named step or ticket}.
- Context: Current behavior, a concrete user scenario, and why this choice is needed now. Define unfamiliar terms and summarize verified constraints with evidence links.
- A — {option}: User-visible result and its main benefit/cost.
- B — {option}: User-visible result and its main benefit/cost.
- Recommendation: {option}, because {reason}; acknowledge the main downside.
- Decision impact: Requirements/scope affected and what cannot proceed without the answer.
- Owner answer: Pending. Ask for “D1: A”, “D1: B”, or an alternative.
```

Use two or three real options when available; do not invent bad options to fill the template. For a yes/no decision, explain what both answers mean. Separate independent decisions rather than combining credential fields, supported modes, and setup UX in one question.

### Example of sufficient context

Illustrative wording, not a project ruling:

**D1 — Should one customer's conversations be shared across two business numbers?**

- **Context:** A company connects separate sales and support numbers. The same customer messages both. We need to decide whether support sees the sales conversation or starts with separate history; this affects privacy and continuity.
- **A — Separate histories:** Each business number has its own conversation. This avoids unexpected cross-team context, but the customer may repeat information.
- **B — Shared history:** Both numbers use one customer conversation. This preserves continuity, but context crosses the sales/support boundary and requires an explicit access policy.
- **Recommendation:** A, so sales and support do not see each other's conversations by default; accept that customers may repeat information.
- **Decision impact:** Blocks Step 2's conversation-identity design. No existing owner ruling is assumed by this example.
- **Owner answer:** Pending; reply “D1: A”, “D1: B”, or describe the desired boundary.

## Review gate

- Keep the brief skimmable, not artificially limited to one page. Each decision must explain the actual trade-off, not merely name a topic.
- Avoid internal code, database schemas, or speculative UI designs. Public API examples are appropriate only when needed to clarify developer-facing behavior.
- Mark unresolved research explicitly. Do not ask for Step 1 approval while a fact the proposal depends on remains unchecked.
- Before approval, resolve every blocking decision. Record the owner's answer and its source/date, then update affected requirements, examples, exclusions, and success criteria. Never label a recommendation “approved.”
- Defer a non-blocking question only to a named later step/ticket with the owner's agreement; do not move a scope decision to Step 2 to bypass this gate.

## Next

Deliver the brief and any open questions. Once blockers are resolved, request `Approved Step 1` and pause. After approval, read [Step 2](step2_solution_assessment.md).
