# Step 2: Feature Description

## Problem

Gateway consumers cannot inspect the assembled model response in `afterUpstream` for streaming language requests, despite receiving it for equivalent non-streaming requests.

## User Stories

- As a hook author, I want streaming `afterUpstream` events to include the assembled response so that capture and observability behavior does not depend on request mode.
- As a gateway maintainer, I want this parity enforced at the shared lifecycle boundary so that all language wire formats remain consistent.

## Core Requirements

- Populate `AfterUpstreamHookArgs.response` after a successful streaming language completion.
- Preserve existing usage, finish reason, warnings, error, and abort behavior.
- Apply uniformly to chat completions, messages, and responses through the shared lifecycle.
- Add a regression test that fails against the current omission and drains the real HTTP stream.

## Shared Component Inventory

- `AfterUpstreamHookArgs`: reuse the existing public contract without changes.
- `createStreamLifecycle`: extend the canonical streaming lifecycle implementation.
- Language route handlers: retain their existing shared lifecycle wiring without route-specific patches.

## User Flow

1. A client submits a streaming language request.
2. The provider stream completes successfully.
3. The gateway assembles the response and invokes `afterUpstream` with it.
4. The hook consumes the response before `afterOperation` completes.

## Success Criteria

- A fully drained streaming HTTP response causes `afterUpstream` to receive a defined response with assembled messages.
- The regression test fails before the lifecycle fix and passes afterward.
- Existing gateway and end-to-end suites remain green.
