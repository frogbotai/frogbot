# Step 2: Feature Description

## Problem

Usage logs retain cost and token metadata but cannot preserve selected request/response payloads for debugging, compliance, or dataset creation. Capture must remain visibly opt-in and must never disrupt model requests.

## User Stories

- As an operator, I want capture disabled by default so that FrogBot retains no prompt content unless I choose otherwise.
- As an API-key owner, I want `off`, `errors-only`, `sample`, or `full` policy so that each workload has appropriate retention.
- As a developer, I want pluggable blob storage and a filesystem default so that local and hosted deployments use the same package.
- As a compliance owner, I want periodic retention cleanup so that debugging data expires automatically.

## Core Requirements

- Capture canonical language request snapshots and successful responses or errors into one gzip blob keyed by `requestId`.
- Resolve opt-out, per-key, and global policies consistently; sample once per request and apply the global policy when no API key exists.
- Append to existing hooks and API-key collection fields without replacing user configuration.
- Log and swallow storage failures so capture never changes the AI result.
- Support finite retention through scheduled cleanup while allowing `null` retention for indefinite storage.

## Shared Component Inventory

- FrogBot AI hook lifecycle: reuse `beforeOperation`, `beforeUpstream`, `afterUpstream`, and `afterError`.
- Hook context bag: reuse as the operation-local policy and snapshot channel.
- API-key collection: extend with `capture` and `captureSampleRate`; no new management UI.
- Payload Jobs Queue: reuse scheduled tasks for retention cleanup.
- Usage logs: retain the existing indexed `requestId` join; no schema changes.

## User Flow

1. Install and configure `capturePlugin` after `apiKeysPlugin`.
2. Leave capture off globally or select a policy on an API key.
3. Send a language request through HTTP, an agent, or an in-process method.
4. The plugin writes an eligible `{requestId}.json.gz` blob without delaying error handling.
5. The scheduled task removes expired blobs when finite retention is enabled.

## Success Criteria

- Default configuration writes no captures.
- Full, sampled, and error-only policies write only their eligible requests.
- Streaming and non-streaming successful captures contain assembled responses; failures contain serialized errors.
- Modality operations are not captured.
- Rejected storage operations are logged and do not fail requests.
- The public package builds, is documented, and passes focused, package, full, and applicable e2e tests.
