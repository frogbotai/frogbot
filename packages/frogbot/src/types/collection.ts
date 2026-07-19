// FrogBot's CollectionConfig — the user-facing authoring shape.
//
// Strategy: extend Payload's CollectionConfig but override hooks, access,
// endpoints, and fields with frogbot's own types (which use FrogbotRequest
// instead of PayloadRequest). Users write hooks against `req.frogbot` —
// sanitize() wraps them for Payload at runtime.
//
// Users import this from `'frogbot'`. They never see the underlying Payload
// type name or import path.

import type { PayloadCollectionConfig } from './payload.js';

import type { CollectionAccess } from './access.js';
import type { AuthConfig } from './auth.js';
import type { Endpoint } from './endpoint.js';
import type { Field } from './fields.js';
import type { CollectionHooks } from './hooks.js';

type Overridden = 'auth' | 'hooks' | 'access' | 'endpoints' | 'fields';

export type CollectionConfig = Omit<PayloadCollectionConfig, Overridden> & {
  /** Per-collection auth. `true` enables FrogBot defaults; object overrides. */
  auth?: boolean | AuthConfig;

  /** Collection hooks. `req` is `FrogbotRequest` with `req.frogbot`. */
  hooks?: CollectionHooks;

  /** Collection-level access control. `req` is `FrogbotRequest`. */
  access?: CollectionAccess;

  /** Custom REST endpoints for this collection. */
  endpoints?: Endpoint[];

  /** Field definitions with frogbot's hook/access types. */
  fields: Field[];

  /** Role markers — first-class typed booleans. Sanitization strips these
   *  before the config reaches Payload. Field contribution per role lands
   *  in a later version. */
  project?: boolean;
  file?: boolean;
  thread?: boolean;
  message?: boolean;
};

/** The four FrogBot role markers. Internal helpers use this list. */
export const ROLE_MARKERS = ['project', 'file', 'thread', 'message'] as const;
export type RoleMarker = (typeof ROLE_MARKERS)[number];

/**
 * Runtime view of a registered collection. Parallel to `CollectionConfig`
 * (authoring input) vs `Collection` (post-boot reality on the running
 * FrogBot instance). Surfaced via `FrogbotInstance.collections`.
 *
 * Intentionally mirrors Payload's `Collection`/`CollectionConfig` split —
 * same concept, FrogBot vocabulary (role markers, simple auth boolean)
 * instead of Payload's sanitized internals.
 */
export type Collection = {
  /** Collection slug. Also the key in `FrogbotInstance.collections`. */
  slug: string;
  /** True if this collection was authored with auth enabled. */
  auth: boolean;
  /** Role markers carried by this collection at config time. */
  roleMarkers: ReadonlyArray<RoleMarker>;
};
