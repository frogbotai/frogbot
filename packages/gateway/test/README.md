# Test Organization

## Unit tests — colocated

Unit tests live next to the source file they test:

```
src/errors/gatewayError.ts
src/errors/gatewayError.spec.ts   ← colocated unit test
```

Rule of thumb: if the test only imports from the file sitting next to it (or its direct dependencies), it's a unit test and belongs colocated.

## Integration / route / e2e tests — this directory

Tests that spin up the full Hono app, make HTTP requests, or exercise multiple layers together live here, mirroring the `src/` structure:

```
test/routes/chatCompletions.spec.ts   ← integration test (full request/response cycle)
```

These tests import from `src/` using relative paths from the `test/` root.
