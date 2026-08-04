# Step 1: Solution Assessment

## Problem

The manifest API playground doubles `/api`, while FrogBot's accurate embedded-gateway endpoint table is disconnected from the chat and standalone-gateway pages where readers look for it.

## Option A: Duplicate the endpoint table

- Pros: puts every path directly on each relevant page.
- Cons: creates competing copies for embedded and standalone routes that can drift.

## Option B: Keep one canonical table and cross-link it

- Pros: preserves `configuration/ai.mdx` as the self-hosted endpoint source of truth and clarifies the distinction from standalone gateway routes.
- Cons: readers follow one link to see the complete table.

## Recommendation

Choose Option B. Fix the manifest frontmatter with the established absolute-URL convention, then link chat and gateway readers to the existing embedded endpoint table.
