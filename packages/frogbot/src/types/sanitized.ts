// FrogBot's sanitized config shape — the output of `buildConfig`.
//
// Preserves FrogBot metadata (role markers, auth flags, onInit) through
// the sanitization boundary. The Payload config is stored internally and
// never exposed to users.

import type { Frogbot } from '../frogbot.js';
import type { AgentConfig } from './agent.js';
import type { SanitizedAIConfig } from './ai.js';
import type { RoleMarker } from './collection.js';

export type SanitizedCollectionMeta = {
  slug: string;
  roleMarkers: ReadonlyArray<RoleMarker>;
  auth: boolean;
};

export type FrogbotSanitizedConfig = {
  collections: SanitizedCollectionMeta[];
  secret: string;
  port?: number;
  onInit?: (frogbot: Frogbot) => Promise<void> | void;
  ai?: SanitizedAIConfig;
  agents?: AgentConfig[];

  /** @internal — not part of the public API. */
  _internal: {
    payloadConfig: Promise<import('payload').SanitizedConfig>; // eslint-disable-line @typescript-eslint/consistent-type-imports
  };
};
