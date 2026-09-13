# Step 2: Solution assessment

Proceed after `Approved Step 1`, unless the owner has [skipped planning steps](FEATURE_DEVELOPMENT_PROCESS.md#when-to-use-this-process) or authorized batch planning. Deliver `step2_solution_assessment.md` in the feature's local planning folder.

## Objective

Compare ways to achieve the approved outcome and agree on an approach before planning implementation. Unless the owner skips this step, explain the choice even when only one approach works.

## Structure

- **Approved outcome:** one-sentence summary and link to Step 1 and applicable owner/program rulings.
- **Options:** usually two or three, named A/B/C. Compare how well each meets the requirements, what existing code it reuses, how hard it is to build and run, and what can go wrong. Use a small table or short bullets.
- **Evidence:** link `research.md` findings and relevant reference code; separate checked facts from uncertainties. Recheck code that has changed and update stale research instead of repeating the entire investigation.
- **Recommendation:** preferred option, why it fits, and its principal downside.
- **Decisions:** choices that significantly affect behavior, complexity, or cost and need the owner's answer; use Step 1's question format.

## Guardrails

- Do not reopen approved product scope silently. If evidence invalidates Step 1, return to it and get revised approval.
- Consider at least one alternative, but distinguish rejected approaches from viable choices. If only one satisfies the contract, explain why the others fail instead of inventing a false choice.
- Keep the assessment concise, not restricted to one page at the cost of useful context.
- Do not build the feature here or design reusable systems for needs we do not have. Include only the code examples needed to explain the options.

## Next

Deliver the assessment, request `Approved Step 2`, and pause. Do not create Step 3 before approval. After approval, read [Step 3](step3_development_plan.md).
