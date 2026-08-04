# Step 1: Solution Assessment

## Problem

FrogBot appends its generated model union after the type compiler's formatting pass, leaving long unions on one line.

## Option A: Hand-format the model union

- Pros: changes only the visibly broken declaration.
- Cons: duplicates Prettier's wrapping rules and leaves other appended declarations unformatted.

## Option B: Format the complete generated artifact

- Pros: restores one formatting boundary for schema types, extra type strings, and FrogBot's footer; preserves Prettier's short-versus-long wrapping behavior.
- Cons: adds one formatting pass to type generation.

## Recommendation

Choose Option B. Format the complete artifact once with the same TypeScript and single-quote options already used by the compiler.
