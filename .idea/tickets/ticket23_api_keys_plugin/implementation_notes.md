# Ticket 23 Implementation Notes

Issue #26 remains deferred. The API keys plugin does not add per-key attribution to usage logs; requests are attributed only to the owning user. A future implementation is sequenced after Ticket 17 and remains plugin-owned: propagate `apiKeyId` from the auth strategy, merge a relationship field into the resolved usage-log collection, and enrich the row by `requestId` in an `afterOperation` hook.

Issue #27 is addressed by deterministic import-map generation before `frogbot dev`, a read-only stale-map warning before `frogbot start`, a user-facing opt-out, template prebuild generation, and workflow documentation. The plugin's access rules, mint endpoint, token hashing, and show-once behavior remain unchanged.
